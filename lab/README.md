# lab/

The lab software half of docs/LAB.md. The substrate (VLAN 70, guests 700 to
739, storage, Caddy names, the runner) is IaC in mojibake/core; this
directory holds what runs on it.

- labapi/: the scenario runner (Python), served on sky-srv:80 under /lab and
  reached at https://thuum.gaussing.tv/lab. Endpoint list pinned in
  docs/LAB.md. Written in M0.
- driver/: lab-driver, the Skyrim Platform plugin (TypeScript) that polls
  lab-api for steps from inside the game. Written in M0.
- scenarios/*.yaml: T3 scenarios. Only lab-api marks them green (ADR-009).
  Review-gated (ADR-016): a scenario change travels in its own commit, Eli
  approves it, and CI refuses a commit that mixes scenario YAML with other
  files.
- frida/*.js: agent-written trace scripts, pulled by the client from lab-api
  and started through a guest exec; *.jsonl outputs are gitignored.
- hooks/post-edit.sh: Claude Code PostToolUse hook (rule 1 and rule 11
  checks, formatting).
- results/: gitignored. Run artifacts live on the host dataset
  rpool/sky/results, mounted at /srv/lab/results on sky-srv and browsed
  read-only at https://thuum.gaussing.tv/results/<run>/. `just lab-run`
  saves each run's result.json here.
- addr.py, ledger.py: written in M0 (`just addr`, `just ledger`).
- Ghidra lives on sky-re, served by pyghidra-mcp at GHIDRA_MCP_URL; nothing
  of it lives here.
