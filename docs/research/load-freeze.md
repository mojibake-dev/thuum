# The load freeze (2026-10-17)

About once in a hundred lab runs, a seat's game goes silent right after
loading: skyrim-platform.log ends at "skse message type 3" (PostLoadGame) and
the game never answers again, alive, not crashed. It hit four times on
2026-10-16 and 17, on both seats, on builds before and after that night's
changes. numidium's lab-api took a full dump of one (20261017-132848, c1,
a-rotfern's rerun) before the rollback, and an agent read its 106 threads
against the 1.6.1170 Address Library (every frame by id; Ghidra was down, so
code reads are disassembly from the dump). HYPOTHESIS until confirmed below.

## What hangs

- The main thread waits forever (WaitForSingleObject, INFINITE) inside the
  frame update (id 36564, the function Skyrim Platform hooks as FrameUpdate)
  on a manual-reset event only the frame's "UI" job signals.
- The "UI" job never runs: five of the six job threads are idle, and the
  sixth runs "Actor movement" and has spun 72 s in id 70172, which turns a
  2D vector into an angle and then loops "while the angle is below 0, add
  2pi". Its input is a NaN, and a NaN never compares as not below 0.
- The NaN comes from a wolf (reference 0x85FA7, a leveled actor's runtime
  base) whose close-point pathing goal is its own position. Its path
  follower (id 90711) ignores a false result from the direction-to-goal
  function (id 93210, false when the squared distance is 0.01 or less) and
  hands 70172 a local that was never written. That slot held a stale return
  address, which reads as a NaN only for some randomized image bases: about
  0.4% of boots, 0.8% of two-seat runs, the order of the four hangs in 333
  runs.
- Unmodified engine code. Skyrim Platform, skse64, the JS engine, the GPU
  driver and RaceMenu are not on the hang path.

## To confirm

1. Every seat's skse64.log kept in every run (it prints the image base):
   the prediction is a hang only when the low 32 bits of image base +
   0x4d0109 fall in [0x7F800001, 0x7FFFFFFF] or [0xFF800001, 0xFFFFFFFF].
2. A second dump: the same chain, the same slot, a NaN in xmm0.
3. A Frida trace on healthy runs (rule 8's dynamic plan): 70172's entry
   when its return address is 90711's call site, logging the vector's raw
   bits; frequent finite garbage would prove the unwritten read without
   waiting for an unlucky base.
4. Ghidra on sky-re: 90711 decompiled, the ignored result confirmed.

## The fix: an existing plugin

AI Pathing Freeze Fix (cashboxs; Nexus SSE mod 190049, main file 801783,
v1.1 of 2026-09-07; github.com/cashboxs/TMS_AIPathingFreezeFix, GPL-3.0 or
later, on CommonLibSSE-NG) fixes this exact hang on 1.6.1170, found on its
own: its README describes the worker spinning on a NaN after the producer
returned false and left its output unwritten, animals making it more
frequent. It finds the angle routine by RelocationID(68820, 70172) and
redirects the call at SkyrimSE+0x11B0CEA, 90711's call to 93210, the call
the dump names: the original runs, and a false result with a non-finite
output gets its output zeroed. It checks the loop's bytes and a unique call
site before arming, logs each repair, and is 1.6.1170 only (not 1.7.99 or
later). SSE Engine Fixes, Scrambled Bugs, Bug Fixes SSE and po3's Tweaks
have nothing for it; the 2026 freeze fixes for 1.6.1170 (Interrupt Package
and Combat Group deadlocks, cell load, block condition) are other bugs.

So the lazy fix is a mod-layer row, Apocalypse's way, for Eli to accept:
docs/MODS.md and persist-mods, and its repair log then is the lab's check
(a repair only on boots whose image base makes the slot a NaN). Still to
confirm in Ghidra (rule 2): that 93210 takes two arguments and writes a 3D
vector, since the plugin writes 12 bytes.

## Found beside it

Skyrim Platform's DirectoryMonitor retried the missing Data/Platform/
PluginsDev in a tight loop, 72.4 s of kernel CPU in this dump, one core on
every seat in every run, and never closed its change notifications: fixed on
fork m2-dirmonitor 01ec9927, for the next train.
