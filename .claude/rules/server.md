---
paths:
  - "skymp/skymp5-server/**"
  - "skymp/papyrus-vm/**"
---

# Server rules

- R0 and R1 logic lives here and nowhere else. If a rule can be enforced on
  the server, it is; the client is a renderer with opinions.
- Every message handler validates owner, bounds, and rate before it touches
  state. Reject loudly with a reason code that the lab can grep.
- State that survives a restart goes through the persistence layer with a
  migration; no side files, no in-memory-only fields on rung R0 to R2.
- A new native, delegation (SpSnippet), or stub adds a line to
  docs/NATIVES.md in the same commit. Delegation is R2 and says so.
- Server logic ships with a T0 test that fails without the change.
- Time, weather, and globals are server-owned; clients never roll their own.
