# REA on sky-re: the trial (asked 2026-10-18, Eli: "go for it")

REA (morluto/rea, "Reverse Engineer Anything"; TypeScript, MIT) is an MCP
server and CLI that gives an agent structured, evidence-bearing tools over
Ghidra, IDA or Hopper: function dossiers with decompiled pseudocode,
instruction inspection, call-target resolution (direct, resolved indirect,
ambiguous, unresolved), struct layouts, byte search and bounded def-use
tracing across calls, each result carrying its evidence, limits and digests
(its docs/native-investigation.md, read 2026-10-18). Its Ghidra provider is
local and ephemeral: it imports a binary itself with analyzeHeadless into
its own database, kept across reopens, and cannot attach to an existing
project or server (docs/ghidra-provider.md). Its Frida tools drive local
processes or a remote frida-server from a Linux host, which thuum does not
need (lab-api runs Frida on the clones); its crash reader takes Linux cores
only (not our Windows minidumps).

## Where it goes

In the sky-re LXC beside pyghidra-mcp, pointed read-only at the persisted
SkyrimSE.exe 1.6.1170, served over the tailnet by a Caddy route like
ghidra.gaussing.tv/mcp (thuum-mundus installs; the exe never leaves
sky-re). Then an entry in thuum's .mcp.json for the re-analyst.

## The acceptance check

One engine question thuum already answered through pyghidra-mcp, asked
again through REA, compared on depth and time (docs/verbs/self-cast.md, the
2026-10-16 read): the callers of Actor::DispelAlteredStates (Address Library
38819 on 1.6.1170; CommonLibSSE-NG src/RE/A/Actor.cpp:209-214), which
pyghidra-mcp gave as the caster's SpellCast (ActorMagicCaster vslot 9,
34144, run by Fire 34407), a successful activation (ActivateRef 19796), a
weapon's hit frame that finds an actor (38603), a bow's release
(ArrowReleaseHandler 42859) and a force-greet (37200), with the one exception
SpellCast passes (the archetype the cast spell carries).

Measured for each tool:
- time from the question to the first usable answer (REA's first open of the
  exe includes its own auto-analysis; count it once, then the warm time);
- the callers found, by Address Library id through lab/addr.py (the five
  above; any sixth is a finding to check, any missing one a miss);
- the exception's read (which archetype SpellCast spares, and how the tool
  shows it);
- false positives (a caller that is not one), and how the tool marks what
  it does not know (REA's unresolved and ambiguous classes, pyghidra's
  decompiler text);
- the agent's effort: prompts needed, context spent.

Hard rule 1 stands whatever the result: CommonLibSSE-NG first, then
addrlib, then Ghidra by either tool; every inferred side effect HYPOTHESIS
until the lab confirms it. Eli decides the re-analyst's default from the
comparison.
