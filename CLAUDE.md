# thuum (skymp-parity)

Make SkyMP play the actual game the way TES3MP plays Morrowind: a persistent,
server-owned world where clients simulate only what the server can't, every
piece of state has exactly one declared authority, and every network byte is
recognized by the Rust wire first. The lab proves each capability; the agent
loop supplies the labor. Definition of done lives in docs/PLAN.md. Decisions already made live in docs/DECISIONS.md; don't relitigate
them in a session, open an ADR instead.

## The design law (lazy and vain)

Lazy: if the engine, CommonLibSSE-NG, Skyrim Platform, or an existing tool does
it, we don't write it. Vain: one authority model, one wire contract, one
toolchain per layer, every feature the same shape.

- Server owns STATE. A host client owns SIMULATION for its cell. The wire
  carries DELTAS. Everything else is a HOOK.
- Every piece of state sits on one authority rung, declared in its verb doc:
  - R0: server computes (inventory transfer, damage numbers, leveling, economy)
  - R1: host computes, server validates (movement, hit registration, casts)
  - R2: host computes, server records (NPC package movement, physics, animation)
  - R3: client-local, never synced (camera, UI, music)
  R3 by omission is a bug. Undeclared state is a bug.
- We do not reimplement engine systems a host client will run for us (AI
  packages, Havok, scenes, dialogue). We reimplement only what needs validation.
- Hosting unit is the cell (TES3MP semantics). Unhosted cells freeze; the
  server holds their last recorded state.
- Languages: Rust for everything that touches the network and for all new
  server code (ADR-010); C++ for the existing core, papyrus-vm, espm, and SP
  native until strangled in exposure order; TypeScript for the SP client and
  gamemode; Python for lab tooling (lab-api, addr.py, ledger.py). Transport is
  renet over netcode (ADR-011); messages are the Rust types in wire-schema
  (ADR-012), which lives in the fork at skymp/skymp-wire (ADR-015). One wire
  implementation on both ends.

## Workspace layout (real, as of 2026-09-24)

- thuum/ (this repo) ... docs/ (PLAN, DECISIONS, LAB, WIRE, VERB, NATIVES, verbs/),
                         lab/ (labapi/, driver/, scenarios/, frida/, hooks/, results/),
                         .claude/ (rules, skills, agents, settings), justfile,
                         .mcp.json, .gitlab-ci.yml
- skymp/ .............. git submodule: our public fork mojibake-dev/skymp, branch
                         parity (main mirrors upstream, ADR-016). Subprojects:
                         skymp5-server, skymp5-client, skyrim-platform, papyrus-vm,
                         libespm, savefile, and our skymp-wire/ (ADR-015). Its vcpkg
                         submodule is initialized only where the server is built.
- CommonLibSSE-NG/ .... git submodule at upstream skyrim-multiplayer/CommonLibSSE-NG:
                         the engine map (classes, vtables, REL::ID). Never modified.
- addrlib/ ............ Address Library database for SkyrimSE 1.6.1170; gitignored,
                         downloaded from Nexus by Eli, read-only to the agent.
- ghidra/ ............. notes only; the Ghidra project lives on sky-re under
                         rpool/sky/persist and is served by pyghidra-mcp (docs/LAB.md).

`just tree` prints the live version of this list.

## Hard rules

1. No offsets, Address Library IDs, vtable indices, RVAs, or function
   signatures from memory. Ever. Sources, in this order: CommonLibSSE-NG
   headers in this tree, addrlib/, Ghidra via MCP. If none has it, the task
   becomes "RE this", not "guess this". lab/hooks/post-edit.sh catches the
   literal case; the rule covers the rest.
2. Decompiler output is a hypothesis. Every inferred side effect is tagged
   HYPOTHESIS in the verb doc until a lab run or a Frida trace confirms it.
3. A verb ships whole or not at all: docs/verbs/<name>.md, native hook, SP
   binding, message, validator, server logic, client handler, T0/T2 tests,
   and a T3 scenario. Partial verbs live on a branch, never on main.
4. Never widen the wire without updating the message contract and the
   validator in the same commit.
5. Client-reported anything is untrusted input. Validate it (R0/R1) or record
   it as unvalidated (R2) in the verb doc. Never trust it silently.
6. DB schema changes ship with a migration and a restart-persistence scenario.
7. TiltedEvolution is a map of which engine functions matter. Read it for
   hook points; never copy code from it (ADR-005).
8. Blocked on in-game behavior: write the Dynamic section of the verb doc
   (Frida script or breakpoint plan plus expected observations) and stop. Do
   not guess and do not loop on it.
9. SP hooks are expensive: filter in native (minSelfId, maxSelfId,
   eventPattern) before crossing into JS.
10. Every new Papyrus native, delegation, or stub gets a line in
    docs/NATIVES.md with its rung. A stub without a ledger entry does not merge.
11. Never use an em dash in anything written in this repo. Comma, semicolon,
    or colon.
12. Network bytes are recognized once, in Rust, before anything else sees
    them. No raw bytes cross the bridge into C++; no `unsafe` outside the two
    FFI crates; no panic reachable from a packet. See .claude/rules/rust.md.
13. Scenario YAML changes go in their own commits and Eli reviews them
    (ADR-009, ADR-016). Never turn a scenario green by weakening its
    assertions; CI refuses a commit that mixes a scenario with other files.

## Workflow per verb

1. Pick the next verb from the current milestone in docs/PLAN.md.
2. `/verb <name>` scaffolds docs/verbs/<name>.md from docs/VERB.md and greps
   CommonLib, SP, and the roadmap for candidates. Fill in: intent, rung, engine
   surface, observe/impose/suppress split, message contract, tests, scenario.
3. Static: if CommonLib has the symbol, cite file:line. If not, delegate to
   the re-analyst subagent (pyghidra-mcp). It returns hypotheses; you file them.
4. Implement inside-out: server logic with its T0 test, then the message in
   wire-schema plus its validator (Rust, same commit), then the SP native
   hook, then the TS handler. Server first because it is the only layer with
   a fast oracle. New handlers are Rust; C++ handlers are legacy.
5. `just test` (T0 unit, T1 host-less native). Green before any lab time.
6. `just lab-run <scenario>`; read the run under
   https://thuum.gaussing.tv/results/<run>/ (server log, client logs,
   screenshots, world diff, pcap, frida traces). Update HYPOTHESIS tags.
7. Still unconfirmed after one lab run: hand the Dynamic plan to Eli. Wait.
8. PR body is the verb doc. Reviewer checklist is at the bottom of docs/VERB.md.

## Commands (justfile, pinned 2026-09-24)

- `just build` ................ Linux server build inside upstream's build image
                                 (skymp/Dockerfile stage skymp-build-base, then
                                 build.sh --configure and --build). On Apple Silicon
                                 set DOCKER_PLATFORM=linux/amd64.
- `just test` ................. T0: ctest --verbose in skymp/build, same image.
- `just build-client` ......... download the client and SP `dist` artifact that
                                 upstream's Windows workflow builds on the GitHub
                                 mirror. T1 is Windows-only and runs on a client.
- `just test-proto` ........... T2: fakeclient sessions against a local server
                                 (lands with the difftest legacy driver, docs/WIRE.md).
- `just wire-build` / `just wire-test` / `just wire-fuzz <target> [seconds]` /
  `just wire-diff <session>` / `just wire-header` / `just wire-header-check`
- `just lab-up` / `just lab-status` / `just lab-run <scenario>` / `just lab-down`
                                 against LAB_API (default https://thuum.gaussing.tv/lab)
- `just frida <script> <client>` run a trace script on a lab client through lab-api
- `just ghidra` ............... confirm GHIDRA_MCP_URL answers
- `just addr <id>` ............ resolve an Address Library ID for 1.6.1170
- `just ledger` ............... regenerate docs/NATIVES.md from the fork
- `just tree` ................. print the real workspace layout

## Testing tiers

- T0 unit: server core, papyrus-vm, espm. No game. Seconds.
- T1 host-less native: CommonLib-based plugin code loaded against the
  SkyrimSE.exe module outside the game. Proves offsets and layouts resolve.
- T2 protocol: fake clients against a real server. Proves sync semantics,
  validation, and persistence across a restart. Includes the differential
  harness: the same session replayed into the C++ core and the Rust edge
  must produce the same outputs (ADR-010).
- T3 lab: two Windows clients plus server on Proxmox. The only tier that
  proves a verb. See docs/LAB.md.
- T4 human: breakpoints, visual judgment, "does it feel like Skyrim".

A verb is done at T3 with a green scenario and no HYPOTHESIS tags left.

## When you don't know

Say so in the verb doc. Ship a smaller verified verb over a larger guessed one.
Never turn a scenario green by weakening its assertions.
