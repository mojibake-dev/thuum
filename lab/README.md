# lab/

The lab software half of docs/LAB.md. The substrate (VLAN 70, guests 700 to
739, storage, Caddy names, the runner) is IaC in mojibake/core; this
directory holds what runs on it.

- labapi/: the scenario runner (Python, FastAPI, a uv project), served on
  sky-srv:80 under /lab and reached at https://thuum.gaussing.tv/lab. Endpoint
  list pinned in docs/LAB.md; the server-side contract in labapi/CONTRACT.md;
  `just test-labapi` and `just labapi-dev` run it on fakes. Its image is
  built by CI and pushed to the sky-ci registry.
- gamemode/: the lab gamemode (gamemode.js) the server loads: the labState
  and labCommand RPCs of CONTRACT.md, plus presets/ for recorded
  appearances. `just test-gamemode` runs it against a fake server object.
- driver/: lab-driver, the Skyrim Platform plugin (TypeScript) that polls
  lab-api for steps from inside the game; `just build-driver` bundles it,
  CI keeps the bundle as an artifact for the client template.
- deploy/sky-srv/: what lands on sky-srv under /srv/lab (compose file, lab
  server settings, env example, layout); `just deploy-srv` puts it there.
- scenarios/*.yaml: T3 scenarios. Only lab-api marks them green (ADR-009).
  Review-gated (ADR-016): a scenario change travels in its own commit, Eli
  approves it, and CI refuses a commit that mixes scenario YAML with other
  files. Coordinates are offsets from a named cell (labapi/guests.yaml).
- frida/*.js: agent-written trace scripts, pulled by the client from lab-api
  and started through a guest exec; *.jsonl outputs are gitignored.
- tools/glab.py: pipeline and job-log status for both GitLab projects, with
  the read-only tokens from the Keychain (never printed).
- hooks/post-edit.sh: Claude Code PostToolUse hook (rule 1 and rule 11
  checks, formatting).
- results/: gitignored. Run artifacts live on the host dataset
  rpool/sky/results, mounted at /srv/lab/results on sky-srv and browsed
  read-only at https://thuum.gaussing.tv/results/<run>/. `just lab-run`
  saves each run's result.json here.
- addr.py (`just addr`): Address Library ids to offsets, from CommonLib's
  loader; ledger.py (`just ledger`): regenerates docs/NATIVES.md from the
  fork. Tests for both under tests/ (`just test-lab`).
- Ghidra lives on sky-re, served by pyghidra-mcp at GHIDRA_MCP_URL; nothing
  of it lives here.
