# thuum task runner. Every command CLAUDE.md names lives here.
# Layout: this superproject (docs/, lab/), skymp/ (our fork, branch parity, which
# holds skymp-wire/), CommonLibSSE-NG/ (upstream), addrlib/ (gitignored download).
# Pinned 2026-09-24 from skymp/docs, skymp/Dockerfile, and docs/LAB.md.

set shell := ["bash", "-euo", "pipefail", "-c"]

skymp    := "skymp"
wire     := "skymp/skymp-wire"
addrlib  := "addrlib"
lab_api  := env_var_or_default("LAB_API", "https://thuum.gaussing.tv/lab")
runtime  := "1.6.1170"
# Upstream's Dockerfile targets x86-64. On Apple Silicon export
# DOCKER_PLATFORM=linux/amd64 (emulated, slow); on sky-ci leave it unset.
docker_platform := env_var_or_default("DOCKER_PLATFORM", "")
platform_flag   := if docker_platform == "" { "" } else { "--platform " + docker_platform }

default:
    @just --list

# Print the real workspace layout (the CLAUDE.md layout section is checked against this).
tree:
    @find . -maxdepth 2 -type d -not -path '*/.git*' -not -path './lab/results*' -not -path './skymp/*' -not -path './CommonLibSSE-NG/*' | sort
    @echo "skymp/ subprojects:"; ls {{skymp}} | grep -v -E '^(vcpkg|build)$' | tr '\n' ' '; echo

# --- build and test -----------------------------------------------------------

# The fork's vcpkg submodule; needed only where the server is built.
fork-deps:
    @git -C {{skymp}} submodule update --init vcpkg

# Upstream's build toolchain image (skymp/Dockerfile, stage skymp-build-base).
build-image:
    @docker build {{platform_flag}} --target skymp-build-base -t skymp-build {{skymp}}

# Output lands in skymp/build (gitignored upstream). Client and SP are Windows builds:
# see build-client. Files are written as the container's user; fix ownership on a
# Linux host with `sudo chown -R "$USER" skymp/build` if needed.
# Linux server build the upstream way: build.sh inside upstream's image, fork bind-mounted.
build: fork-deps build-image
    @docker run --rm {{platform_flag}} -v "$PWD/{{skymp}}:/src" -w /src skymp-build sh -c "./build.sh --configure && ./build.sh --build"

# T1 (host-less native against the exe) is Windows-only and runs on a lab client.
# T0 unit tests (server core, papyrus-vm, espm): ctest in skymp/build, same image.
test: build-image
    @docker run --rm {{platform_flag}} -v "$PWD/{{skymp}}:/src" -w /src/build skymp-build ctest --verbose

# Downloads the newest `dist` artifact from mojibake-dev/skymp into skymp/build/dist-client.
# Client and Skyrim Platform: fetch what upstream's Windows workflow built on the GitHub mirror.
build-client:
    @mkdir -p {{skymp}}/build/dist-client
    @gh run download -R mojibake-dev/skymp -n dist -D {{skymp}}/build/dist-client
    @ls {{skymp}}/build/dist-client | head

# T2 protocol tests: fakeclient sessions against a local server, including restart persistence.
test-proto:
    @echo "TODO(M0, Track W step 8): fakeclient lands with the difftest legacy driver; see docs/WIRE.md" && exit 1

# --- reverse engineering ------------------------------------------------------

# A streamable-HTTP MCP endpoint answers a bare GET with a 4xx, so any HTTP status counts.
# Confirm pyghidra-mcp answers at GHIDRA_MCP_URL.
ghidra:
    @code=$(curl -sS -o /dev/null -w '%{http_code}' "${GHIDRA_MCP_URL:?set GHIDRA_MCP_URL}") && echo "ghidra mcp: http $code at $GHIDRA_MCP_URL"

# Resolve an Address Library ID for the pinned runtime. Never type the answer into code by hand.
addr id:
    @python3 lab/addr.py "{{addrlib}}" "{{runtime}}" "{{id}}"

# Regenerate docs/NATIVES.md from the fork, preserving hand-maintained rung/reason columns.
ledger:
    @python3 lab/ledger.py "{{skymp}}" docs/NATIVES.md

# Run a Frida trace script on a lab client through lab-api.
frida script client:
    @curl -fsS -X POST "{{lab_api}}/frida" -F "client={{client}}" -F "script=@{{script}}"

# --- lab (docs/LAB.md endpoint list) ------------------------------------------

# Bring the lab up: server snapshot checked, clients rolled back, heartbeats waited on.
lab-up:
    @curl -fsS -X POST "{{lab_api}}/up"

# Guest power, heartbeats, netem state, free memory.
lab-status:
    @curl -fsS "{{lab_api}}/status"

# POST /run returns a run id; GET /run/<id> is polled until result.json exists and is
# saved to lab/results/<run>.json.
# Run one scenario through lab-api; exit code is the verdict.
lab-run scenario:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p lab/results
    run=$(curl -fsS -X POST "{{lab_api}}/run" -F "scenario=@lab/scenarios/{{scenario}}.yaml" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["run"])')
    echo "run $run started"
    python3 - "$run" "{{lab_api}}" <<'PY'
    import json, sys, time, urllib.request
    run, api = sys.argv[1], sys.argv[2]
    while True:
        with urllib.request.urlopen(f"{api}/run/{run}", timeout=30) as r:
            body = json.load(r)
        if body.get("verdict") in ("green", "red", "error"):
            break
        print("  ", body.get("phase", "running"), body.get("step", ""), flush=True)
        time.sleep(10)
    json.dump(body, open(f"lab/results/{run}.json", "w"), indent=2)
    print(run, body["verdict"], "->", f"https://thuum.gaussing.tv/results/{run}/")
    sys.exit(0 if body["verdict"] == "green" else 1)
    PY

# Tear the lab down: roll back clients and server, clear netem.
lab-down:
    @curl -fsS -X POST "{{lab_api}}/down"

# --- wire (Rust edge, docs/WIRE.md; lives in the fork, ADR-015) ---------------

# Build the workspace; the client cdylib and cxx bridge included.
wire-build:
    @cd {{wire}} && cargo build --workspace

# Unit + property tests, clippy with the deny set, cargo-deny, and the committed header check.
wire-test: wire-header-check
    @cd {{wire}} && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings && cargo deny check

# Run one fuzz target for a bounded time in seconds (default 600). Corpora are committed.
wire-fuzz target seconds="600":
    @cd {{wire}} && cargo +nightly fuzz run {{target}} -- -max_total_time={{seconds}}

# Replay a session into the legacy stack and the Rust edge and diff.
wire-diff session:
    @cd {{wire}} && cargo run -p difftest -- difftest/sessions/{{session}}.yaml

# Regenerate the committed C header the SP client includes (cbindgen is a CLI, not a build-dep).
wire-header:
    @cd {{wire}}/crates/wire-client-ffi && cbindgen --config cbindgen.toml --crate wire-client-ffi --output include/skymp_wire.h

# Fail if the committed header is stale.
wire-header-check:
    @cd {{wire}}/crates/wire-client-ffi && tmp=$(mktemp) && cbindgen --config cbindgen.toml --crate wire-client-ffi --output "$tmp" && diff -u include/skymp_wire.h "$tmp" && echo "header up to date"

# Export the schema description for the napi layer and docs.
wire-schema:
    @echo "TODO(M1): schema export (a doc generator over wire-schema); not an M0 bullet" && exit 1
