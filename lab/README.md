# lab/

- hooks/post-edit.sh: Claude Code PostToolUse hook (rule 1 and rule 11 checks, formatting).
- scenarios/*.yaml: T3 scenarios. Only lab-api marks them green.
- frida/*.js: agent-written trace scripts; *.jsonl outputs are gitignored.
- results/: run artifacts, gitignored, read-only to the agent container.
- addr.py, ledger.py, lab-api: written in M0. See docs/LAB.md for what lab-api does.
