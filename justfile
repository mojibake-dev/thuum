# skymp-parity task runner. Every command CLAUDE.md names lives here.
# Paths marked TODO are pinned in M0 from skymp/docs; do not guess them.

set shell := ["bash", "-euo", "pipefail", "-c"]

skymp    := "skymp"
addrlib  := "addrlib"
lab_api  := env_var_or_default("LAB_API", "http://sky-srv/lab")
runtime  := "1.6.1170"

default:
    @just --list

# Dump the real workspace layout so CLAUDE.md can be corrected on first session.
tree:
    @find . -maxdepth 2 -type d -not -path '*/.git*' -not -path './lab/results*' | sort

# --- build and test -----------------------------------------------------------

# TODO(M0): pin from {{skymp}}/docs (CMake presets, vcpkg triplets, Node version).
build:
    @echo "TODO(M0): server, client, SP build per {{skymp}}/docs" && exit 1

# T0 unit (server core, papyrus-vm, espm) + T1 host-less native (CommonLib against the exe module).
test:
    @echo "TODO(M0): ctest for T0; CommonLib host-less suite for T1" && exit 1

# T2 protocol tests: fake clients against a real server, including restart persistence.
test-proto:
    @echo "TODO(M0): fake-client harness against a local server" && exit 1

# --- reverse engineering ------------------------------------------------------

# Confirm the Ghidra MCP bridge is reachable from this workspace.
ghidra:
    @curl -fsS "${GHIDRA_MCP_URL:?set GHIDRA_MCP_URL}" >/dev/null && echo "ghidra mcp: ok"

# Resolve an Address Library ID for the pinned runtime. Never type the answer into code by hand.
addr id:
    @python3 lab/addr.py "{{addrlib}}" "{{runtime}}" "{{id}}"

# Regenerate docs/NATIVES.md from papyrus-vm, preserving hand-maintained rung/reason columns.
ledger:
    @python3 lab/ledger.py "{{skymp}}" docs/NATIVES.md

# Run a Frida trace script on a lab client through lab-api.
frida script client:
    @curl -fsS -X POST "{{lab_api}}/frida" -F "client={{client}}" -F "script=@{{script}}"

# --- lab ----------------------------------------------------------------------

# Bring up the lab (server snapshot, client templates cloned, heartbeats waited on).
lab-up:
    @curl -fsS -X POST "{{lab_api}}/up"

# Run one scenario; artifacts land in lab/results/<run>/; exit code is the verdict.
lab-run scenario:
    @curl -fsS -X POST "{{lab_api}}/run" -F "scenario=@lab/scenarios/{{scenario}}.yaml" -o lab/results/last.json
    @python3 -c "import json,sys; r=json.load(open('lab/results/last.json')); print(r['run'], r['verdict']); sys.exit(0 if r['verdict']=='green' else 1)"

# Tear the lab down: roll back clients and server, clear netem.
lab-down:
    @curl -fsS -X POST "{{lab_api}}/down"

# --- wire (Rust edge, docs/WIRE.md) ------------------------------------------

wire := "skymp/skymp-wire"

# Build the workspace; the client cdylib and cxx bridge included.
wire-build:
    @cd {{wire}} && cargo build --workspace

# Unit + property tests, clippy with the deny set, cargo-deny.
wire-test:
    @cd {{wire}} && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo deny check

# Run one fuzz target for a bounded time in seconds (default 600). Corpora are committed.
wire-fuzz target seconds="600":
    @cd {{wire}} && cargo +nightly fuzz run {{target}} -- -max_total_time={{seconds}}

# Replay a session into the C++ core and the Rust edge and diff.
wire-diff session:
    @cd {{wire}} && cargo run -p difftest -- difftest/sessions/{{session}}.yaml

# Regenerate the C header the SP client includes.
wire-header:
    @cd {{wire}} && cargo build -p wire-client-ffi && ls crates/wire-client-ffi/include/skymp_wire.h

# Export the schema description for the napi layer and docs.
wire-schema:
    @echo "TODO(M0): schema export (postcard-schema or a doc generator over wire-schema)" && exit 1
