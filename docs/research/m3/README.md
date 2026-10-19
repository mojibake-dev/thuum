# M3 research, 2026-10-16 night

Read-only research for M3 (hosting), drafted during a lab wait, the sources
of ADR-035 (proposed). Each note cites its source by path and line or URL.

- skymp-hosting.md: what SkyMP does today for NPCs and hosting (fork parity
  ef44a1d8), against M3's list, with probes that would settle its guesses.
- tes3mp.md: TES3MP 0.8.1's cell authority, actor sync, AI on and off,
  unloaded cells, handoff, spawning and death.
- te-npcs.md: Skyrim Together's NPC ownership, read as a map only (ADR-005:
  no code from it enters this repo).
- re-ai-puppet.md: the engine's AI switches for an NPC that renders but runs
  no AI (the re-analyst on sky-re, 1.6.1170); every id by `just addr`, every
  inference tagged HYPOTHESIS.

- drafts/: the first M3 lab runs, by path and solo on c1: x-npc-puppet (needs
  the driver's npc-ai and npc-state steps, thuum branch m3-npc-probe), and
  the engine-alone references r-npc-packages, r-npc-fight and r-cell-leave.
  Copies of the scratchpad files numidium runs; a reference that reads right
  is committed alone under lab/ as ADR-031 asks.
- readings-2026-10-17.md and readings-2026-10-18.md: the first live lab
  readings (the engine alone on 2026-10-17; the three references again on
  the new driver on 2026-10-18: Riverwood's fourteen by reference id, the
  start-combat step, the puppet probe reproduced), each closing with what
  the tools could not see; riverwood-ids.md names the residents.

