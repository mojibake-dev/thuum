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

## Knobs for the day (00:24 PDT)
The motion feel numbers are settings (fork m3-turbo-knobs a29f237a, in the morning's stage if its pipeline is
green): `skymp5-client.movement` in the seat's skymp5-client-settings.txt with `leadSeconds` (0.2, the running
lead), `leadDecay` (0.5, its run-out per standing sample), `deadbandMoving` (8), `deadbandStill` (1),
`popDistance` (256), `popWindowMs` (600), `jumpDistance` (1024) and `sendRateMs` (130, the player's own samples
and the host's samples of its NPCs). Any of them is a line in the settings file and a plugin reload (client-hot
or a relaunch), no build; the defaults are the shipped values, so an absent block changes nothing. Eli's "jerky
NPCs" and "snap after a jog" are read against these first: a lower sendRateMs smooths puppets at the cost of
bandwidth, a longer leadSeconds leads figures further, a slower leadDecay glides longer.

The seat's settings file is lab/deploy/sky-client/skymp5-client-settings.txt's JSON (server-ip, server-port,
gameData.profileId, headshot-spells); the knobs are a top-level block beside them, every key optional:

```json
"movement": {
  "sendRateMs": 130,
  "leadSeconds": 0.2,
  "leadDecay": 0.5,
  "deadbandMoving": 8,
  "deadbandStill": 1,
  "popDistance": 256,
  "popWindowMs": 600,
  "jumpDistance": 1024
}
```

Written onto the seat (identity.ps1 lays the file in Data\Platform\Plugins of each game folder), then a
plugin reload or a relaunch; a turbo-log line names the values.

## Measured before the day (00:29 PDT)
The plain plugin reload keeps a seat whole (c2, 07:26 to 07:27Z: a rewrite of skymp5-client.js, the reload
proved by the settings-file line, look and a walk landing at the server after it), so a client fix lands by
`just client-hot <client> <file>` in seconds and the seat stays in play; the seat is marked hot and a relaunch
or rollback clears the mark before any set-up. `just lab-tail server|c1|c2` streams the server's log and a
seat's console for the live read.

## The morning's order (00:32 PDT)
1. The layer-merge sweep (97 scenarios) ends about 07:00 PDT; green merges the D37 layer and promotes the
   clones (a red stops for a read).
2. 56's stage (m3-turbo-knobs a29f237a if green, else 7b61b533), the composed world, both seats relaunched and
   streamed.
3. x-voice-lines with `just frida lab/frida/voice-lines.js c1` (57's read), about five minutes.
4. client-hot's first use: a same-bytes push of a seat's current client (the tool's live proof), then `just
   lab-tail server` and `just lab-tail c1` open for the day.
5. "Seats ready" to Eli; the day runs as the runbook says.
