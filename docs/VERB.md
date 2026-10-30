# Verb: <name>

Copy to docs/verbs/<name>.md. A verb is one thing the multiplayer layer can
now do to or with the engine. Everything below is filled before code; the doc
is the PR body.

## Intent

One sentence. What a player can do, or what the server can now know.

Roadmap reference: <skymp/ROADMAP.md item, or "none">
Milestone: <M0..M7>   Class: <A|B|C>

## Inventory (ADR-031: the action's consequences, before its rung)

Everything the engine plays for this action, listed before any authority
question, from two sources: the reference trace (the recorder in a solo
client run, kept as lab/references/<action>.json and reviewed like a
scenario) and the records (lab/esm.py: WEAP, the race's ATKD, MGEF and the
scripts its VMAD attaches, SPEL, SHOU, PROJ, EXPL, IPDS). A consequence can
live in a record's script rather than in the engine's own path (Unrelenting
Force's throw is VoicePushEffectScript on MGEF 0x7F82F, not its Stagger
effect), so the inventory reads the scripts too. One row per consequence;
each row has exactly one disposition. A row without one blocks the merge, as
an undeclared rung does.

| consequence | seen in | disposition |
| --- | --- | --- |
| <a graph event or variable, an effect, a shader or art, a sound, an impact, a ragdoll or impulse, an actor value change, a HUD message> | trace / record / both | native (the host game plays it) / imposed (the server tells the game to) / suppressed: <reason> / later: <the slice that takes it> |

The parity scenario (lab/scenarios/p-<action>.yaml) compares the multiplayer
run's trace, per viewpoint (actor and target; a bystander once the lab has a
third client), with the reference; its `later:` list is this table's "later"
rows and nothing else.

### Sequences and combinations (ADR-033)

How the action repeats and combines, each row a probe or a scenario, green
before the verb is done: the action again at a person's rhythm (the next
within a second of the last); the action from each input that performs it
(each hand, both hands separately, the perk's dual cast, the voice;
sneaking, moving, on a mount where they apply); the action interrupted (a
cancelled charge, a sheathe mid-way, a stagger during it); both players
doing it at each other; the action after a login or a cell change. A rule
over hands, actors or seats lists every combination here before it merges.

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| <the same action again, N times, gaps 300 to 900 ms, moving> | x-<name>-rhythm or b-<name> | <run id, green or the finding> |
| <each hand; both hands separately; the perk's dual cast> | | |
| <interrupted: cancelled, sheathed, staggered> | | |
| <both seats at each other> | | |
| <after a login or a cell change> | | |

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

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

A box whose item the verb has none of (no new native, no wire change) is ticked with
"(none: why)"; `just status` counts ticked boxes, and an item with nothing to do is done.
A box ticked ahead of its evidence is unticked with the date and the reason.

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
9. Does the Inventory list every consequence of the reference trace and the
   records, each with one disposition, and does the parity scenario's later
   list match its later rows and nothing more?
10. Is every sequence and combination row green (the action again at a
    person's rhythm, each input that performs it, interrupted, both seats),
    and does every item of the playtest checklist have a scenario that does
    it the way a person does (ADR-033)?
11. Was `just fork-lint <fork tree>` clean before each fork push, and is the
    head's GitHub Formatting check green? Parity was red there from 10-15 to
    10-17 on two faults every branch inherited: Hooks.cpp formatted by a newer
    clang-format, and skyrimPlatform.ts edited without Definitions.txt.
