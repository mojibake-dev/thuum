# A turbo day (D49, 00:21 PDT 2026-10-28): how 2026-10-28 runs

The machinery is ADR-041's (turbo-srv, turbo-client, turbo-log, turbo-back) with ADR-054's hot path when it
measures alive. The cadence ADR-053 set stays for the days after; this is the day's shape.

## The morning (numidium)
1. 56's stage over parity (fork m3-pt35-fixes 7b61b533), the world composed as 35's (rotfern test 1, Prisoner
   test 2), both seats relaunched, the streams, no hold longer than the day.
2. First thing on the stage: x-voice-lines with `just frida lab/frida/voice-lines.js c1` (57's Dynamic read).
3. No gate before play. 56's five probes run in the gaps Eli leaves (a probe takes the seats five minutes) or at
   night with the gate.

## The day (Eli and thuum-magnus)
- Eli plays; a finding is a sentence. thuum-magnus reads the server log and both consoles live, names the cause
  and pushes the fix:
  - a TypeScript client change: webpack here (three seconds), `just client-hot <client> <file>` (the reload, if
    measured alive) or `just turbo-client <ref>` (a relaunch, about forty seconds a seat);
  - a server change: the fork branch's CI builds the image (about eight minutes), `just turbo-srv <tag>` swaps the
    running server (about thirty seconds); the world is kept;
  - a Skyrim Platform (C++) change: the Windows build (about ten minutes), then `just client-dist` with a relaunch;
  - every push gets one `just turbo-log` line; `just turbo-back` undoes the last one.
- Authority changes (a claim, a death, an inventory, a persistence rule, the wire) take CI's T0 and T2 before the
  push; everything else goes on the build's green.
- No scenario is written during the day; what broke gets its probe at night or the next day.

## The night (numidium)
- The gate on the day's head (the touched verbs' scenarios once the map is in, the full M3 list otherwise), the
  merge, the nightly full sweep; a red reopens its verb in the morning.

## What Eli looks at (the eight items of docs/private/playtest-m3-36.md)
The claim as a player lives it, the chore a late joiner sees, the voice's later lines (57, if the trace
confirms and the build lands), bows that kill by the engine, the head after teleports, the figure's stop, NPC
motion against 35, the feel.
