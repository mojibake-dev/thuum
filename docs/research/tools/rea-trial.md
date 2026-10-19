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

## Installed (2026-10-18 21:0x PDT, by thuum-magnus on Eli's word)

The sky-re container has no internet, so the bundle was built on the Mac
(node v22.23.3 linux-x64 and `npm install --os=linux --cpu=x64
rea-agents@6.7.0`, 30 MB and 37 MB) and pushed through the host (scp to
core, `pct push`): /opt/node, /opt/rea, and the wrapper
/usr/local/bin/rea-mcp (GHIDRA_INSTALL_DIR=/opt/ghidra, Temurin 21,
REA_PROVIDER=ghidra, GHIDRA_HEADLESS_MAXMEM=4G, REA's home and database
under /var/lib/rea since /srv/persist is read-only there). REA is
stdio-only, so no Caddy route: thuum's .mcp.json runs it as
`ssh root@core.gaussing.tv pct exec 701 -- /usr/local/bin/rea-mcp`, and an
MCP initialize from the Mac answers with the server's name and version.
pyghidra-mcp and the Ghidra project are untouched; the exe stays on sky-re
(REA reads /srv/persist/game/SkyrimSE-1.6.1170.0.exe.unpacked.exe and keeps
its own analysis database). The install script is kept beside this note as
install-rea-in-ct.sh.

## The check's addresses on 1.6.1170 (lab/addr.py, `just addr`, 2026-10-18)

RVAs in SkyrimSE 1.6.1170.0 (the image base 0x140000000 added for a
Ghidra address): DispelAlteredStates 38819 at 0x6c6d90; the callers the
2026-10-16 read named: SpellCast 34144 at 0x5b1290 (run by Fire 34407 at
0x5bbd40), ActivateRef 19796 at 0x2eac20, the weapon hit frame 38603 at
0x6b9460, ArrowReleaseHandler 42859 at 0x7b9230, the force-greet 37200 at
0x660410; the dispel chain 34510 at 0x5c2780 and ActiveEffect::Dispel 34061
at 0x5ac880. REA's first open of the exe (its own auto-analysis) started at
21:07 PDT; the comparison runs on its procedure_references and
resolve_native_call_targets at 0x1406c6d90 against those six.

