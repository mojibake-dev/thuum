---
description: Scaffold a verb doc from docs/VERB.md and gather CommonLibSSE-NG, Skyrim Platform, and roadmap candidates for it
argument-hint: <verb-name> [search-term]
---

Verb: $0. Create docs/verbs/$0.md from docs/VERB.md if it does not exist.

Candidates in CommonLibSSE-NG for "$1":
!`rg -n -i "$1" CommonLibSSE-NG/include 2>/dev/null | head -40`

Skyrim Platform hooks, events, and docs mentioning "$1":
!`rg -n -i "$1" skymp/skyrim-platform skymp/docs/skyrim_platform 2>/dev/null | head -40`

Roadmap context:
!`rg -n -i "$1" skymp/ROADMAP.md 2>/dev/null`

Existing ledger lines:
!`rg -n -i "$1" docs/NATIVES.md 2>/dev/null`

Fill the verb doc in this order: intent, rung and the reason for not going one
rung higher, engine surface (cite file:line or write UNKNOWN and delegate to
the re-analyst subagent), observe/impose/suppress, message contract, server,
client, tests, scenario id. Then print the Status checklist from docs/VERB.md.
Do not write code until the doc exists.
