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
# The fork branch whose Windows build the lab clients run (ADR-018: the 1.7 port).
client_branch := "parity"   # the 1.7 port fast-forwarded parity on 2026-10-02 (ADR-018); one branch
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
build-client branch=client_branch:
    #!/usr/bin/env bash
    set -euo pipefail
    run=$(gh run list -R mojibake-dev/skymp --workflow parity-windows.yml --branch {{branch}} --status success --limit 1 --json databaseId --jq '.[0].databaseId')
    test -n "$run" || { echo "no successful Parity Windows run on the mirror for branch {{branch}} yet"; exit 1; }
    rm -rf {{skymp}}/build/dist-client && mkdir -p {{skymp}}/build/dist-client
    gh run download "$run" -R mojibake-dev/skymp -n dist -D {{skymp}}/build/dist-client
    echo "run $run -> {{skymp}}/build/dist-client (client/ is what a lab client needs)"; ls {{skymp}}/build/dist-client

# T2 on sky-srv (ADR-019): the server build SERVER_TAG (default the lab's) from the clean world, the fakeclient smoke checked through labState, then difftest's sessions against the legacy RakNet stack (LEGACY_TAG, default parity-legacy); lab/tools/test-proto.sh.
test-proto tag="":
    @if [ -n "{{tag}}" ]; then SERVER_TAG="{{tag}}" lab/tools/test-proto.sh; else lab/tools/test-proto.sh; fi

# --- reverse engineering ------------------------------------------------------

# A streamable-HTTP MCP endpoint answers a bare GET with a 4xx, so any HTTP status counts.
# Confirm pyghidra-mcp answers at GHIDRA_MCP_URL (an MCP initialize over streamable HTTP; a bare GET gets 406).
ghidra:
    @curl -sS -m 20 -X POST -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' "${GHIDRA_MCP_URL:-https://ghidra.gaussing.tv/mcp}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"thuum","version":"0"}}}' | sed -n 's/^data: //p' | python3 -c 'import sys,json; d=json.load(sys.stdin); si=d["result"]["serverInfo"]; print("ghidra mcp ok:", si["name"], si["version"])'

# Import an exe from /srv/persist/game into the Ghidra project on sky-re (LXC 701) as a transient
# systemd unit; pyghidra-mcp is stopped for the analysis and restarted after. Hours for SkyrimSE.
# Runs lab/tools/ghidra-import.sh inside sky-re for one exe, e.g. `just ghidra-import SkyrimSE-1.7.104.0.exe`.
ghidra-import exe:
    #!/usr/bin/env bash
    set -euo pipefail
    host=root@core.gaussing.tv
    scp -q lab/tools/ghidra-import.sh "$host:/tmp/ghidra-import.sh"
    ssh "$host" 'pct push 701 /tmp/ghidra-import.sh /usr/local/sbin/ghidra-import.sh --perms 0755 && rm /tmp/ghidra-import.sh'
    ssh "$host" "pct exec 701 -- systemd-run --unit ghidra-import --collect --property=WorkingDirectory=/srv/persist/ghidra /usr/local/sbin/ghidra-import.sh /srv/persist/game/{{exe}}"

# Progress of the running or last Ghidra import on sky-re: unit state and the log tail.
ghidra-import-status:
    @ssh root@core.gaussing.tv 'pct exec 701 -- bash -c "systemctl status ghidra-import --no-pager -n 3 2>&1 | head -12; echo ---; tail -n 15 /srv/persist/ghidra/import-*.log 2>/dev/null | cut -c1-160"'

# Headless Ghidra on sky-re, no MCP in the loop (the MCP server indexes the whole binary before its first
# answer): `just ghidra-query <program> decompile <addr>`, `... xrefs <addr>`, `... bytes <addr> [n]`.
# Addresses are image addresses (0x1409e3580) or RVAs with a leading '+' (+0x9e3580).
ghidra-query program +args:
    @lab/tools/ghidra-query.sh {{program}} {{args}}

# Resolve an Address Library ID for the pinned runtime. Never type the answer into code by hand.
addr id:
    @python3 lab/addr.py "{{addrlib}}" "{{runtime}}" "{{id}}"

# Index every Address Library ID CommonLibSSE-NG names (function, data, offset, vtable, rtti) into lab/relids.tsv.
relid:
    @python3 lab/relid.py

# Regenerate docs/NATIVES.md from the fork, preserving hand-maintained rung/reason columns.
ledger:
    @python3 lab/ledger.py "{{skymp}}" docs/NATIVES.md

# Unit tests for the lab tooling (addr.py, ledger.py, lab-api). Fixture tests skip without the CommonLibSSE-NG submodule.
test-lab:
    @python3 -m unittest discover -s lab/tests -v

# The lab gamemode against a fake server object (node:test).
test-gamemode:
    @node --test lab/gamemode/gamemode.test.js

# Bundle lab-driver (Skyrim Platform plugin) into lab/driver/build/lab-driver.js.
build-driver:
    @cd lab/driver && npm ci --silent && npm run --silent build && ls -la build/lab-driver.js

# lab-api's tests through its uv environment (FastAPI, httpx, PyYAML); `test-lab` skips them without it.
test-labapi:
    @uv run --project lab/labapi python -m unittest discover -s lab/tests -v

# lab-api on the fakes: no Proxmox, no server, no clients; LAB_API=http://127.0.0.1:8080/lab.
labapi-dev:
    @uv run --project lab/labapi labapi-dev

# A cold stacked snapshot clean-m1-<x> of a lab client, through lab-api (thuum-mundus's recipe: quiesce, a clean
# ACPI shutdown, snapshot without RAM, start, agent check; sky-c1 and sky-c2 only, never clean-sp).
client-snapshot client name description="":
    @python3 -c 'import json, sys; print(json.dumps({"name": sys.argv[1], "description": sys.argv[2]}))' {{quote(name)}} {{quote(description)}} \
      | curl -fsS -m 900 -X POST "{{lab_api}}/clients/{{client}}/snapshot" -H 'content-type: application/json' --data-binary @-

# Promote a stacked snapshot onto its base (clean-m1-<x> onto clean-m1, bit-identical), through lab-api.
client-promote client from to="clean-m1":
    @curl -fsS -m 900 -X POST "{{lab_api}}/clients/{{client}}/promote" -H 'content-type: application/json' -d '{"from": "{{from}}", "to": "{{to}}"}'

# Run a Frida trace script on a lab client through lab-api.
frida script client:
    @curl -fsS -X POST "{{lab_api}}/frida" -F "client={{client}}" -F "file=@{{script}}"

# --- lab (docs/LAB.md endpoint list) ------------------------------------------

# Bring the lab up: server snapshot checked, clients rolled back, heartbeats waited on.
lab-up:
    @curl -fsS -X POST "{{lab_api}}/up"

# Guest power, heartbeats, netem state, free memory.
lab-status:
    @curl -fsS "{{lab_api}}/status"

# POST /run returns a run id; GET /run/<id> is polled until result.json exists and is
# saved to lab/results/<run>.json.
# Run one scenario through lab-api; exit code is the verdict. `game` picks the Skyrim version the run plays
# (ADR-022: 1.7.104 or 1.6.1170); empty means the scenario's, else lab-api's default. A path to a YAML file
# runs that file instead: an exploratory x- probe, which never lives in lab/scenarios (ADR-009).
lab-run scenario game="":
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p lab/results
    game="{{game}}"; extra=(); [ -z "$game" ] || extra=(-F "game=$game")
    # One run at a time, and a run's verdict comes before its artifacts are in: a run posted
    # right after another's verdict gets 409. Wait up to ten minutes for the lab to be idle.
    for _ in $(seq 60); do
        idle=$(curl -fsS -m 15 "{{lab_api}}/status" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("run") is None)' || echo False)
        [ "$idle" = True ] && break
        sleep 10
    done
    file="lab/scenarios/{{scenario}}.yaml"; [ -f "{{scenario}}" ] && file="{{scenario}}"
    run=$(curl -fsS -X POST "{{lab_api}}/run" -F "scenario=@$file" ${extra[@]+"${extra[@]}"} \
        | python3 -c 'import json,sys; print(json.load(sys.stdin)["run"])')
    echo "run $run started${game:+ on $game}"
    python3 - "$run" "{{lab_api}}" <<'PY'
    import json, sys, time, urllib.request
    run, api = sys.argv[1], sys.argv[2]
    misses = 0
    while True:
        try:
            with urllib.request.urlopen(f"{api}/run/{run}", timeout=30) as r:
                body = json.load(r)
            misses = 0
        except (OSError, ValueError) as e:
            # The run lives on sky-srv; a dropped poll (the tailnet, Caddy) must not fail it.
            misses += 1
            if misses > 30:
                raise
            print("   poll failed, retrying:", e, flush=True)
            time.sleep(10)
            continue
        if body.get("verdict") in ("green", "red", "error"):
            break
        print("  ", body.get("phase", "running"), body.get("step", ""), flush=True)
        time.sleep(10)
    json.dump(body, open(f"lab/results/{run}.json", "w"), indent=2)
    print(run, body["verdict"], "->", f"https://thuum.gaussing.tv/results/{run}/")
    sys.exit(0 if body["verdict"] == "green" else 1)
    PY

# One client's own state outside a run, nothing reset (lab-api GET /lab/probe): the engine's player
# controls, health, position and the last rest, for a playtest that hits something odd.
probe client:
    @curl -fsS -m 30 "{{lab_api}}/probe?client={{client}}" | python3 -c 'import json,sys; d=json.load(sys.stdin); st=d.get("state") or {}; print(json.dumps({k: st.get(k) for k in ("controls", "menus", "inMenuMode", "furniture", "sitState", "sleepState", "health", "magicka", "stamina", "pos", "cellName", "down", "rested", "afterRest", "gameHour")}, indent=2) if d.get("ok") else d)'

# Tear the lab down: roll back clients and server, clear netem.
lab-down:
    @curl -fsS -X POST "{{lab_api}}/down"

# Copy the lab tree and the sky-srv deployment files to /srv/lab on sky-srv (VM 700) through the host jump.
srv_ssh := "ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -J root@core.gaussing.tv"
deploy-srv:
    #!/usr/bin/env bash
    set -euo pipefail
    host=eli@10.10.70.10
    {{srv_ssh}} "$host" 'mkdir -p /srv/lab/thuum/lab /srv/lab/server/data /srv/lab/server/world /srv/lab/snapshots'
    # not lab/.cache: the tools read it on this Mac and ship what a clone needs over their own hop, and the
    # third-party files in it reach the lab only through persist (docs/MODS.md)
    rsync -az --delete -e "{{srv_ssh}}" --exclude node_modules --exclude .venv --exclude build --exclude __pycache__ --exclude results --exclude frida/uploads --exclude .cache lab/ "$host:/srv/lab/thuum/lab/"
    rsync -az -e "{{srv_ssh}}" lab/deploy/sky-srv/docker-compose.yml "$host:/srv/lab/docker-compose.yml"
    # a settings file whose load order names a plugin its version's master directory lacks stops the server at
    # its next start (2026-10-07: RaceMenu.esp deployed before persist-mods, mid-sweep): check before copying
    for pair in "server-settings.json:/srv/persist/esm/1.6.1170" "server-settings-1.7.104.json:/srv/persist/esm"; do
      file=${pair%%:*}; dir=${pair#*:}
      names=$(python3 -c 'import json,sys,os; print(" ".join(os.path.basename(p) for p in json.load(open(sys.argv[1]))["loadOrder"]))' "lab/deploy/sky-srv/$file")
      {{srv_ssh}} "$host" "cd $dir && for n in $names; do test -f \"\$n\" || { echo \"$file names \$n, which $dir lacks (just persist-mods first)\" >&2; exit 2; }; done"
    done
    rsync -az -e "{{srv_ssh}}" lab/deploy/sky-srv/server-settings.json lab/deploy/sky-srv/server-settings-1.7.104.json "$host:/srv/lab/server/"
    {{srv_ssh}} "$host" 'test -f /srv/lab/.env || { cp /srv/lab/thuum/lab/deploy/sky-srv/env.example /srv/lab/.env; echo "NOTE: /srv/lab/.env created from env.example; fill PVE_TOKEN_SECRET by hand"; }'
    {{srv_ssh}} "$host" 'ls -la /srv/lab /srv/lab/server; docker compose -f /srv/lab/docker-compose.yml config --quiet && echo "compose config ok"'

# Streams through this machine with scp -3 (nothing licensed is staged locally), checks hashes on both
# ends, writes SHA256SUMS per directory. Needs fenestrate up: ask, never start Eli's desktop.
# Copy the five master .esm files and the pinned SkyrimSE.exe from fenestrate into rpool/sky/persist on the host.
persist-game:
    @lab/tools/persist-game.sh

# The lab's mod layer into rpool/sky/persist (docs/MODS.md): RaceCompatibility 2.16 from Nexus (md5-checked) and
# Eli's rotfern from ~/Code/mods/rotfern-skyrim, under mods/ for the clones and their plugins in each esm dir.
persist-mods:
    @lab/tools/persist-mods.sh

# Stage the built lab-driver, its settings and the PowerShell helpers into C:\sky-lab on a Windows lab VM
# through the guest agent (lab/deploy/sky-client/README.md); nothing outside that directory.
stage-client vmid: build-driver
    @lab/tools/stage-client.sh {{vmid}}

# GitLab pipelines: `just ci` shows both projects, `just ci-run thuum|skymp` starts an API pipeline on the
# default branch (image jobs included), `just ci-log skymp <job-id>` tails a job.
ci *args:
    @python3 lab/tools/glab.py {{args}}
ci-run project:
    @python3 lab/tools/glab.py run {{project}}
ci-log project job:
    @python3 lab/tools/glab.py log {{project}} {{job}}

# Set a Windows lab client's Sunshine base port (48989 for c1, 49989 for c2) through the guest agent; the
# host maps that family one to one. Moonlight follows the port Sunshine advertises, so no translation.
client-sunshine-port vmid base:
    @lab/tools/client-sunshine-port.sh {{vmid}} {{base}}

# Run a PowerShell script in the lab user's desktop session on a Windows lab client (the guest agent alone
# only reaches session 0): steam:// links, launchers, the game. Needs register-runner.ps1 applied once.
client-run vmid script:
    @lab/tools/client-run.sh {{vmid}} {{script}}

# Pull the script-extender layer (versionlib-*.bin into addrlib/, SKSE loader and DLLs into lab/.cache/skse/)
# from fenestrate's Skyrim install so the lab clients get the same files; then `just stage-client <vmid>`.
pull-layer:
    @lab/tools/pull-layer.sh

# Launch the game through SKSE on a Windows lab client (desktop session), report processes, the SKSE log and
# any dialog's text, and pull a screenshot into lab/results/. The T3 bring-up loop in one command.
client-launch-test vmid:
    @lab/tools/client-launch-test.sh {{vmid}}

# Arm ProcDump on a clone for the next SkyrimSE.exe launch: a mini dump per access violation, first chance
# included, up to count (C:\sky-lab\dumps); client-dumps lists and fetches them under the 16 MiB cap.
client-dump-arm vmid count="10":
    @lab/tools/client-dump-arm.sh {{vmid}} {{count}}
client-dumps vmid:
    @lab/tools/client-dumps.sh {{vmid}}

# Fetch the current WHQL GeForce driver for one card family into lab/.cache/nvidia-driver-<family>.exe
# through NVIDIA's lookup (product series psid, product pfid, Windows 11 x64 osID 135). NVIDIA split
# Pascal into its own branch in 2025, so the lab's two cards need two packages: `just gpu-driver-fetch`
# fetches both (GTX 1050: 101/845; RTX 5060 Ti: 131/1076); `just client-gpu-driver <vmid>` picks the
# one for the card the clone shows (PCI device id), the template having none.
gpu-driver-fetch:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p lab/.cache
    for spec in "pascal 101 845" "blackwell 131 1076"; do
      set -- $spec
      url=$(curl -sS -m 30 "https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=$2&pfid=$3&osID=135&languageCode=1033&beta=0&isWHQL=1&dltype=-1&dch=1&upCRD=0&qnf=0&sort1=0&numberOfResults=1" | python3 -c 'import sys,json; d=json.load(sys.stdin); i=d["IDS"][0]["downloadInfo"]; print(i["DownloadURL"]); print("version", i["Version"], i["ReleaseDateTime"], file=sys.stderr)')
      curl -sS -L -m 1200 -o "lab/.cache/nvidia-driver-$1.exe" "$url" && ls -la "lab/.cache/nvidia-driver-$1.exe"
    done
client-gpu-driver vmid installer="":
    @lab/tools/client-gpu-driver.sh {{vmid}} {{installer}}

# Set a headless clone's desktop mode (the Virtual Display Driver comes up at 800x600) and the game's window
# to match, borderless: `just client-display <vmid>` per clone, after the GPU driver.
client-display vmid w="1920" h="1080" hz="60":
    @lab/tools/client-display.sh {{vmid}} {{w}} {{h}} {{hz}}

# The game's traffic outside the lab on a clone (game-firewall.ps1): block SkyrimSE.exe outside 10.10.70.0/24 so
# bethesda.net connects fail at once instead of stalling Skyrim Platform's first tick, and set a machine WinHTTP
# proxy that never resolves so the Bethesda.net request fails with an error the game closes, not one it retries.
client-game-firewall vmid:
    @lab/tools/client-game-firewall.sh {{vmid}}

# Steam into offline mode on a clone (loginusers.vdf WantsOfflineMode): a cold boot in the dark lab otherwise
# leaves Steam connecting forever and the Steam-wrapped game exits before SKSE runs (steam-offline.ps1).
client-steam-offline vmid:
    @lab/tools/client-steam-offline.sh {{vmid}}

# Windows Error Reporting minidumps for SkyrimSE.exe under C:\sky-lab\dumps on a clone (crash-dumps.ps1).
client-crash-dumps vmid:
    @lab/tools/client-crash-dumps.sh {{vmid}}

# The Steam Streaming Speakers on a clone (steam-speakers.ps1): an audio output from the first launch, so the
# game has sound and Sunshine something to stream; Sunshine itself installs them only when a stream starts.
client-steam-speakers vmid:
    @lab/tools/client-steam-speakers.sh {{vmid}}

# OneDrive off on a clone (onedrive-off.ps1): its backup prompt opened over the game on sky-c1.
client-onedrive-off vmid:
    @lab/tools/client-onedrive-off.sh {{vmid}}

# A T4 playtest's start (docs/private/playtest-*.md): both lab characters to a hunters' camp southwest of the spawn,
# each a few steps from a tent over an unowned bedroll, at half health, magicka and stamina. Both clients online, no
# lab run active.
playtest-start:
    @lab/tools/playtest-start.sh

# In a playtest, quit a player's game and start it again ("quit test 1": client c1 or c2), and wait for its login.
playtest-relaunch client:
    @lab/tools/playtest-relaunch.sh {{client}}

# In a playtest, open a player's race menu from the server (profile 1 or 2; the gamemode's labCommand open-race-menu).
playtest-race-menu profile:
    @curl -fsS -m 15 -X POST "{{lab_api}}/state/rpc/labCommand" -H 'content-type: application/json' -d '{"payload": {"kind":"open-race-menu","profileId":{{profile}}}}'; echo

# A clone's own Sunshine identity (sunshine-identity.ps1): clones inherit the template's uniqueid and certificate,
# and Moonlight keeps one entry per uniqueid, so it showed one lab client for two. Pair the clone afresh after.
client-sunshine-identity vmid name:
    @lab/tools/client-sunshine-identity.sh {{vmid}} "{{name}}"

# The current client dist (just build-client) plus the lab files onto a clone and into the game (install-lab.ps1).
client-dist vmid:
    @lab/tools/client-dist.sh {{vmid}}

# A second Skyrim version's game folder on a clone (ADR-022): Steam's depots for it from persist over the
# VLAN, then SKSE, the client dist and the lab files (add-game.ps1). After `just client-dist <vmid>`; ends in
# a cold retake of the clone's snapshot by thuum-mundus.
client-game vmid version="1.6.1170":
    @lab/tools/client-game.sh {{vmid}} {{version}}

# The lab's mod layer (persist's mods/, just persist-mods) into every game folder on a clone, plugins enabled
# (add-mods.ps1). After `just client-dist <vmid>`; ends in a snapshot of the clone.
client-mods vmid:
    @lab/tools/client-mods.sh {{vmid}}

# A clone's scenario client name and profile id (identity.ps1): the template carries c1 / 1.
client-identity vmid client profile:
    @lab/tools/client-identity.sh {{vmid}} {{client}} {{profile}}

# Stage Frida's standalone injector into C:\sky-lab\frida on a clone (lab/frida/README.md), for `just frida`.
client-frida vmid:
    @lab/tools/client-frida.sh {{vmid}}

# A lab-driver change onto a clone: build, push the bundle into Data\Platform\Plugins, relaunch and confirm the
# login and heartbeat, stop the game. Ends in a cold clean-sp retake by thuum-mundus (the rollback erases it otherwise).
client-driver vmid profile="": build-driver
    @lab/tools/client-driver.sh {{vmid}} {{profile}}

# Bring a fresh clone of the template up to a connected lab client, in order: its Sunshine base port
# (48989 sky-c1, 49989 sky-c2), the NVIDIA driver, the 1920x1080 display, the game firewall, Steam offline,
# crash dumps, the current client dist, the clone's client name and profile id, and a launch test that must end with the client logged in. Its address is set by thuum-mundus's `sky-lab` first.
client-bringup vmid base client="c1" profile="1":
    just client-sunshine-port {{vmid}} {{base}}
    just client-sunshine-identity {{vmid}} "sky {{client}}"
    just client-gpu-driver {{vmid}}
    just client-display {{vmid}}
    just client-game-firewall {{vmid}}
    just client-steam-offline {{vmid}}
    just client-steam-speakers {{vmid}}
    just client-crash-dumps {{vmid}}
    just client-onedrive-off {{vmid}}
    just client-dist {{vmid}}
    just client-identity {{vmid}} {{client}} {{profile}}
    just client-launch-test {{vmid}}

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
