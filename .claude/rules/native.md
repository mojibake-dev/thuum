---
paths:
  - "skymp/skyrim-platform/**/*.cpp"
  - "skymp/skyrim-platform/**/*.h"
  - "skymp/skymp5-client/**/*.cpp"
  - "skymp/skymp5-client/**/*.h"
---

# Native hook rules (Skyrim Platform / CommonLibSSE-NG)

- Resolve every address through CommonLibSSE-NG (`REL::ID`, `REL::Relocation`)
  and cite the header in a comment above the hook. Raw RVAs do not merge.
- Hook the narrowest function that carries the intent: the call that decides,
  not the one that renders. If you can only find the renderer, say so in the
  verb doc and tag the hook HYPOTHESIS.
- Filter before JS: `minSelfId`, `maxSelfId`, `eventPattern`. Crossing into
  the JS context per call is the cost model; design for it.
- Every hook has an enter/leave contract, a list of what it suppresses, and a
  config kill switch so the lab can A/B it.
- Suppression is per actor and reversible: a cell losing its host must
  re-enable engine behavior without a reload.
- Log at hook entry under the verb's tag (`[verb:<name>]`); scenarios grep it.
- Papyrus types and calls are only valid inside SP events and hooks; do not
  touch them from arbitrary contexts.
