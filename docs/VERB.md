# Verb: <name>

Copy to docs/verbs/<name>.md. A verb is one thing the multiplayer layer can
now do to or with the engine. Everything below is filled before code; the doc
is the PR body.

## Intent

One sentence. What a player can do, or what the server can now know.

Roadmap reference: <skymp/ROADMAP.md item, or "none">
Milestone: <M0..M7>   Class: <A|B|C>

## Authority

Rung: <R0|R1|R2|R3>
Why this rung and not the one above it:
What the server validates (R1) or records (R2):
Rate limit / bounds:

## Engine surface

- CommonLibSSE-NG symbol(s): <path/to/header.h:line> or UNKNOWN
- Address Library ID(s): <from addrlib/, never from memory> or UNKNOWN
- If UNKNOWN: delegated to re-analyst on <date>; hypothesis block pasted below.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point:
- SP filter (minSelfId / maxSelfId / eventPattern):
- Data captured:
- Side effects of hooking here: HYPOTHESIS | CONFIRMED (<run id>)

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet):
- Visual without simulation achieved by:
- Side effects: HYPOTHESIS | CONFIRMED (<run id>)

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed:
- How (blockPapyrusEvents, setInventory guard, AI toggle, hook early-return):
- Release condition (host handoff, cell unload):
- Side effects: HYPOTHESIS | CONFIRMED (<run id>)

## Message contract

- Message name / numeric type:
- Direction:
- Fields (name: type, units, bounds):
- Validator rules:
- Idempotency / ordering:
- Contract doc updated: yes/no

## Server

- Where the logic lives:
- DB fields / migration:
- Restart behavior:
- Papyrus natives touched (ledger lines added):

## Client

- SP binding:
- TS handler:
- Kill switch config key:

## Tests

- T0:
- T1:
- T2:
- T3 scenario id: lab/scenarios/<id>.yaml
- Assertions that would fail if the verb silently regressed:

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/<name>.js (functions by Address Library ID, args
  and return values to log, scenario step that triggers them)
- Breakpoint plan for a human session: function, condition, what to watch,
  expected value if the hypothesis holds, value that falsifies it
- Owner: agent (Frida) | Eli (x64dbg)

## Status

- [ ] doc complete, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated

## Reviewer checklist

1. Is the rung right, and is the reason for not going one rung higher real?
2. Does every address come from CommonLib, addrlib, or a Ghidra reference?
3. Is there any state this verb creates that is not on a rung?
4. Does the validator reject the obvious forgery (wrong owner, out of range,
   too frequent)?
5. Does the restart scenario exist and pass?
6. Are the HYPOTHESIS tags gone, and were they cleared by evidence?
7. Is the suppression reversible on host handoff?
8. Did the ledger change if a native did?
