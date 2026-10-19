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

## What the first open taught (21:10 PDT)

open_binary answers at once with the file's facts (PE, x86_64, its
SHA-256); the Ghidra import and auto-analysis run at the first
provider-backed call (list_procedures), and REA's project is session-private
under the system temp directory, removed when the server process closes or a
call fails (docs/installation.md): every MCP server process imports the exe
again, so one import per agent session, and REA_GHIDRA_STARTUP_TIMEOUT_MS
(330 s by default, covering import, analysis and the bridge; a timeout
restarts the analysis next call) is raised to 30 minutes in the wrapper. The
first attempt at the default cut the analysis at 300 s; the timed run
follows.

## The check, measured (2026-10-18 21:2x PDT)

- Time: 462 s from the first provider-backed call to a usable answer
  (REA's import and Ghidra auto-analysis of the 37 MB exe, 4 cores, 4 GB
  heap; 465 s the run before), then 10 ms for procedure_references and 36 ms
  for analyze_function. pyghidra-mcp's 2026-10-16 read took the re-analyst
  a session of prompting on an already-analyzed project (minutes of agent
  time; the project's own analysis was paid once, years of lab-time ago).
- Callers: REA's incoming references to 0x1406c6d90 (DispelAlteredStates,
  38819) are ten: five UNCONDITIONAL_CALLs, from 0x1402eb36a in 0x1402eac20
  (ActivateRef 19796), 0x1405b1475 in 0x1405b1290 (SpellCast 34144),
  0x14066065b in 0x140660410 (the force-greet 37200), 0x1406b98c7 in
  0x1406b9460 (the weapon hit frame 38603) and 0x1407b938d in 0x1407b9230
  (ArrowReleaseHandler 42859): the five pyghidra-mcp named, none missing,
  none extra; four CONDITIONAL_JUMPs inside the function's own body; and
  one DATA reference from 0x14365bbe8 with no procedure (a pointer to the
  function in data, HYPOTHESIS a vtable slot or a function table; the
  2026-10-16 read did not mention it: a finding to check, not a caller).
  Fire 34407 is rightly absent as a direct caller (it calls SpellCast).
- The exception: REA's pseudocode of the function is the read itself: if
  the flags byte at +0xb0 has bit 2 and param_2 != 0xb, dispel archetype
  0xb (Invisibility, 11) on the MagicTarget at +0xa0 through FUN_1405c2780
  (34510, 0x5c2780); if FUN_140662c90(this) (the ethereal check) and
  param_2 != 0x29, dispel archetype 0x29 (Etherealize, 41) the same way. So
  the one exception is the archetype passed in, exactly as self-cast.md
  says, and the MagicTarget at +0xA0 matches the lab's measured offset
  (memory: commonlib-relocation-columns).
- Evidence quality: every reference carries its kind (type, call, jump,
  data, indirect, computed, conditional), provenance (ghidra-reference-
  manager), and the result carries confidence "observed" and authority
  "shipped-artifact", with unresolved_calls listed (none here). The dossier
  has pseudocode, assembly, callers, callees, both reference directions,
  strings, names, basic blocks, native value flow and a limitations list.
- Agent effort: one session, four tool calls, no prompting; the cost is
  the import per server process (eight minutes) and result envelopes too
  large for a character cap (parse structuredContent; list_procedures on
  the whole exe exceeds the stdio budget by design).

Verdict for Eli: on this question REA equals pyghidra-mcp's depth and beats
its effort, at eight minutes of startup per session. A fair default for
the re-analyst's reads, with pyghidra-mcp kept for the analyzed project's
names and comments (REA's project is ephemeral and unnamed).

## Decided (Eli, 2026-10-18 21:5x PDT: "i say we make REA the default too")

REA is the re-analyst's default for reads; pyghidra-mcp keeps the named
project. What changed on this branch for it: .claude/agents/re-analyst.md
(step 2 asks REA first and says which tools, and never list_procedures on
the whole exe), docs/LAB.md (sky-re's row, the static RE paragraph, the
`rea` server beside GHIDRA_MCP_URL, the reference), the justfile's `just
rea` (REA's own MCP doctor: identity, 207 tools, a target-free request,
about three seconds, no import).

Cost to know: the import is paid once per server process, and Claude Code
keeps a stdio server for the session, so a session's first REA question
costs about eight minutes and the rest milliseconds.

Follow-ups, not taken yet:
- REA_GHIDRA_DISABLED_ANALYZERS can skip expensive analyzers at import
  (REA names it in its own remediation text); a timed run would say what
  it saves against the 462 s.
- REA_GHIDRA_SEED_FILE takes `address<TAB>kind[<TAB>name]` lines (kinds
  function, code, label; format rea-ghidra-seeds-v1, up to a million
  entries) applied before analysis. `just relid` already produces every
  Address Library ID CommonLibSSE-NG names with its name, and addrlib
  resolves them for 1.6.1170: a seed file from those two would give REA's
  ephemeral project CommonLib's names at import, the one thing the named
  pyghidra project has over it.
- The data reference to DispelAlteredStates from 0x14365bbe8 (what holds
  it) and SpellCast's spared archetype: asked of REA in a second
  background run on 2026-10-18 night, result pending.

## The transport, changed (Eli, 2026-10-18 22:0x PDT: "i agree with numidium go ahead and set that up. im ok accepting defaults, meaaning your recommendations on all that.")

numidium's point: the first .mcp.json entry ran `ssh root@core.gaussing.tv
pct exec 701`, so every Claude session in the repo held a root session on
the Proxmox host for its lifetime. Now the entry is `ssh -J
root@core.gaussing.tv rea@10.10.70.11`: the jump only forwards a TCP
connection (there is no route from a Mac into VLAN 70 otherwise, docs/LAB.md),
and the session is the system user `rea` on sky-re, locked password, whose
authorized_keys are the host's root principals (whoever could run REA
before) each under `restrict,command="/usr/local/bin/rea-mcp"`. The wrapper
reads SSH_ORIGINAL_COMMAND: `doctor` or `doctor --format json` runs REA's
MCP doctor, nothing else is offered, and with no command it serves. sky-re's
host key was verified out of band (`pct exec 701 -- cat
/etc/ssh/ssh_host_ed25519_key.pub` against the pin the first connect made)
before `just rea` and an MCP open_binary were run over the route.

Defaults accepted with that message (my recommendations): REA the default;
sky-re's memory ceiling raised rather than pyghidra-mcp retired now (mundus,
sky.tf; a ceiling, not a reservation), pyghidra-mcp kept until a seed file
built from `just relid` and addrlib gives REA's project CommonLib's names,
then retired so one Ghidra serves; one REA import at a time meanwhile.

## The second question, answered (2026-10-18 22:09 PDT, the import 468 s, the queries 0.0 to 0.1 s)

- SpellCast (0x1405b1290, 34144) chooses the spared archetype itself: it asks
  FUN_14014bf40(spell, 0xb) and, failing that, FUN_14014bf40(spell, 0x29)
  (HYPOTHESIS: "does this magic item carry an effect of this archetype"), and
  calls DispelAlteredStates(actor, archetype) with 0xb (Invisibility), 0x29
  (Etherealize) or 0xffffffff (spare nothing). So a cast whose spell carries
  Invisibility keeps the caster's Invisibility, and any other cast ends it:
  the reading self-cast.md and the recast fix (fork 0636f14e) rest on, now
  read by a second tool from the same bytes. Still a static read: the verb
  doc's tags come off only with a lab run or a trace (rule 2).
- SpellCast's incoming references are 33: 31 jumps inside its own body and
  two DATA references, no direct calls. It is a virtual method (CommonLib's
  MagicCaster::SpellCast; the two DATA references are its vtable slots,
  HYPOTHESIS), so Fire (34407) reaches it through the vtable, which is why
  the 2026-10-16 read could name Fire as a caller only by reading Fire.
- address_name on 0x14365bbe8 (the data reference to DispelAlteredStates)
  returned no name: the address carries no label in REA's fresh project.
  What holds it (a vtable, a function table) is a question for the named
  pyghidra project or for REA's search around that address; still open.
- The lesson of the stalled first attempt, for anyone driving REA by hand:
  its JSON-RPC parsing is strict, and a request with an unknown top-level
  key (a client's own bookkeeping field) gets no answer at all, not an
  error. Initialize went through because it was clean; every tools/call
  hung. `rea mcp doctor` (`just rea`) proves the server without an import;
  open_binary answers in 0.1 s; the import runs at the first provider-backed
  call.

## Seeds: CommonLib's names at import (2026-10-18 22:26 PDT)

lab/tools/rea-seeds.py turns lab/relids.tsv (`just relid`) into REA's
rea-ghidra-seeds-v1 file through lab/addr.py: 614 functions (CommonLib's
function relocations and Offsets.h) and 15,843 labels (data, vtables, RTTI
and NiRTTI) for 1.6.1170 at the image base; 1,278 IDs CommonLib names are
not in the 1.6.1170 database and 196 rows have no AE ID; eight aliases share
an address and are joined with `__or__` (REA admits one seed per address
and kind, and refuses the whole file on a duplicate: the first attempt
failed that way, reported as `provider_unavailable` / `version_unresolved`
with every check green, since a seed-file error surfaces as a configuration
error). `just rea-seeds` regenerates and installs the file; the wrapper
exports REA_GHIDRA_SEED_FILE when the file is readable.

Measured on the second attempt, as the rea user over the jump: import 474 s
(462 to 468 unseeded), then address_name 0x1406c6d90 answers
`Actor::DispelAlteredStates` and the dossier reads

    void Actor__DispelAlteredStates(longlong param_1, int param_2) {
      if (((*(byte *)(param_1 + 0xb0) & 2) != 0) && (param_2 != 0xb))
        FUN_1405c2780(param_1 + 0xa0, 0xb);
      cVar1 = Actor__GetGhost(param_1);
      if ((cVar1 != '\0') && (param_2 != 0x29))
        FUN_1405c2780(param_1 + 0xa0, 0x29);
    }

so the ethereal check of the earlier read is Actor::GetGhost (CommonLib's
name for 0x140662c90), and ActivateRef is named among the callers; SpellCast,
the force-greet, the weapon hit frame and ArrowReleaseHandler stay FUN_
because CommonLib carries no relocation ID for them (virtual or
vtable-reached). 0x14365bbe8 still has no name. The analysis profile records
the seed commitment (sha256 661be793..., 614 function and 15,843 label
entries), so an answer says which names it was given.

