# Turbo mode: the measurements behind ADR-041

Read on 2026-10-19 for ADR-041 (docs/DECISIONS.md). Sources: the GitHub
Actions runs of mojibake-dev/skymp (the API's job timings and the run logs'
`##[group]` stamps), the GitLab jobs of root/skymp on sky-ci (their traces),
docs/LOG.md, docs/LAB.md and the lab's scripts. Fork line numbers are at
parity d5b05e89. "Unmeasured" means no number exists in the tree or the logs.

## 1. The Windows client build

Workflow "Parity Windows Flatrim (AE/SE)", skymp/.github/workflows/parity-windows.yml,
calling upstream's composite action .github/actions/pr_base/action.yml. The
two most recent green runs, both on m2-train-27-snap, both a vcpkg binary
cache hit on the same key. The composite action is one step to the API; the
inner rows come from the log's group stamps.

| step | run 39212407689 | run 39207598638 |
| --- | --- | --- |
| queue (run created to job started) | 0:03 | 0:39 |
| checkout (depth 1, submodules) | 0:15 | 0:15 |
| restore the vcpkg binary cache (398 MB, one entry, created 2026-10-02) | 0:07 | 0:03 |
| pr_base: Early build skymp5-client (`yarn`, `yarn build`; action.yml:83-88) | 0:16 | 0:23 |
| pr_base: OpenCppCoverage | 0:19 | 0:21 |
| pr_base: move vcpkg to C:/vcpkg, bootstrap | 0:36 | 0:40 |
| pr_base: configure (vcpkg install, .esm download, CMake) | 2:22 | 2:29 |
| pr_base: build (`cmake --build build --config Release`, MSBuild) | 16:12 | 25:30 |
| pr_base: test (`ctest -C Release --verbose`, 14 tests; coverage 2:12 and 3:15 of it) | 2:57 | 4:06 |
| pr_base: nine artifact uploads | 0:34 | 0:39 |
| job total | 23:52 | 34:41 |

Over the 31 green runs of the 29.7 h to 2026-10-19 07:46Z: 22:22 best, 34:07
median, 36:08 max, bimodal (six at 22 to 24 min, the rest 28 to 36). The
spread between the two runs above is MSBuild and coverage on identical inputs
and identical cache behaviour (573 compile lines in both logs): runner speed.
The cache's Save step was skipped on every run (the package count did not
change), so the entry is the one from 2026-10-02; no miss has occurred since,
and the only figure for one is the workflow comment's "about 10 minutes" for
the CommonLibSSE-NG port (parity-windows.yml:7-14). No ccache or sccache
anywhere in the fork. Of 67 runs in the window, 27 were cancelled by the
concurrency group (a newer push on the same branch, parity-windows.yml:27-29)
and 6 failed (three compile errors in skyrim-platform's EventHandler.cpp
failing at 8 to 10 min, two unit-test reds, one coverage flake). The
Formatting check's median is 1:50; Prettier's 0:18.

What the dist is: `build/dist` (179 MiB on 39212407689: client/ and server/),
plus `Flatrim_skymp5-client.js` alone (1 MiB; action.yml:369-381),
`server-dist`, the SP nexus archive (150 MiB). `just build-client` downloads
`dist` (justfile:52-65). MpClientPlugin.dll is skymp-wire's cargo build copied
(skymp5-server/cpp/CMakeLists.txt:15-19; cmake/wire.cmake:21 names wire-bridge
and wire-client-ffi on Windows): 73 crates, "Finished release in 27.67s" on
the runner. The fork's own GitLab `client-build` job on a Windows shell runner
exists and has never run (skymp/.gitlab-ci.yml:151-182, gated on
CLIENT_BUILD_WINDOWS; zero jobs in the 800-job window).

## 2. The server image

skymp/ci/server.Dockerfile, built by skymp/.gitlab-ci.yml's `server-build`
(:101-149) on runner thuum-docker (sky-ci, VM 702), one job at a time, pushed
to sky-ci's registry (10.10.70.12:5000, lab/deploy/sky-srv/env.example:5) as
`skymp-server:<ref-slug>-<sha8>` and `:<ref-slug>`. GitLab root/skymp,
2026-10-11 to 10-19: 203 server-build jobs, 180 green. 153 of the green ones
took 6 to 9 min, 3 longer (max 11:29), 24 under 2 min (a parity push after a
fast-forward merge: every layer cached, median 0:13). Median off parity 7:42.
Queue median 3 s, max 26:35 (behind other jobs on the one slot).

Inside job 8454 (m2-train-27-snap c32cf0bd, 7:48 wall): vcpkg fetch 6.5 s;
Rust toolchain and cxxbridge-cmd 48.6 s; configure 15.6 s and ninja 342 s
(658 steps, 386 C++ objects, 91 cargo units); ctest 57 s (13 tests; T0 runs
here); dist copy 0.1 s. The cache-mount trial (branch m2-ci-server-cache:
`--mount=type=cache` for /src/build and the cargo registry, the Rust install
before `COPY`): cold 7:57 (job 8511), warm 6:39 (job 8531) with 245 ninja
steps for a one-line comment change (216 C++ objects: 99 in
skymp5-server/cpp, 81 in unit, 36 in skymp5-server; 9 wire crates), so the
tree is not yet incremental; ccache or a kept build directory is the open
lever (ADR-040 item 4). Not measured: the registry push and sky-srv's pull
(about 14 s of the job's wall sits outside the BuildKit steps), the
container's start to "listening on" (bounded: 45 x 2 s in
lab/tools/playtest-world.sh:43, 120 s in lab/labapi/labapi/config.py:217).

## 3. The lab's steps

| step | measured | source |
| --- | --- | --- |
| a stage's lay (deploy-srv, the tag switch, the dist into both clones, two snapshots) | 9 to 9.5 min | ADR-040's table (branch adr040-cycle-time) |
| a probe on the stage | about 2.2 min | ADR-040's table |
| T2 | 23 min (03:57 to 04:20, 06:04 to 06:27 PDT) | docs/LOG.md:1994, :2025 |
| a gate | 23 runs in 51 min; 25 in 60; 27 in 73 | docs/LOG.md:2005-2006, :2042-2044, :2088-2094 |
| a full sweep | 58 of 58, about 136 min to the last start | docs/LOG.md:2047-2048 |
| a run's client rollback to connected | 81 s; 63 to 87 s; 83 s | docs/LOG.md:37, :1707, :1785 |
| a seat's relaunch | median 31.5 s a step (156 of 239), in game 27.6 s after the command; bounded at five minutes | ADR-036 (branch adr036-relaunch); lab/tools/playtest-relaunch.sh:35-36; config.py:250 |
| a reconnect after a server restart | about 40 s | docs/LOG.md:37; config.py:191-197 |
| playtest setup, server side | 14:06 to 14:08 PDT, the seats relaunched 14:09 | docs/LOG.md:2097-2105 |
| a layer stage | clean in five minutes; about 7 minutes, the smoke included | docs/LOG.md:1287, :1722 |
| the dist laid into a clone (client-dist.sh) | unmeasured; the install task is bounded at 20 min | lab/tools/client-dist.sh:18 |
| a local `yarn build` of skymp5-client | unmeasured (16 to 23 s on the hosted runner) | action.yml:83-88 |
| a plugin hot reload's latency, and skymp5-client across one | unmeasured | |

## 4. Mechanisms, by file

- A seat reconnects by itself after a server restart:
  skymp5-client/src/services/services/networkingService.ts:57-58 (`reconnect()`
  recreates the client), :83-85 (the `disconnect` case calls it);
  authService.ts:656-661 (a player who saw gameplay re-logs after 15 s);
  lab-api's `_wait_online` relies on it (lab/labapi/labapi/runner.py:816-823)
  and its `server: restart` is `docker compose restart` and a TCP wait
  (runner.py:504-508).
- The world survives a restart: the file driver's directory is a bind mount
  (lab/deploy/sky-srv/docker-compose.yml:32; `databaseDriver: "file"`,
  skymp5-server/cpp/server_guest_lib/database_drivers/DatabaseFactory.cpp:20);
  the proof is lab/scenarios/a-restart-persistence.yaml:31-45; the save
  storage ticks each world tick (server_guest_lib/WorldState.cpp:159, :748).
  lab-api's runs replace the world from a snapshot (runner.py:431-457), which
  is why a playtest world is saved and restored around them
  (lab/tools/playtest-world.sh:25-45).
- Skyrim Platform's plugin reload: a thread per plugin folder on
  `FindFirstChangeNotificationW(..., FILE_NOTIFY_CHANGE_LAST_WRITE)`
  (skyrim-platform/src/platform_se/skyrim_platform/DirectoryMonitor.cpp:10-16,
  `Updated()` at :61); the tick reads the flags and, when one is set,
  `ClearState()` then `LoadFiles()` for every folder (SkyrimPlatform.cpp:113-129;
  `ClearState` at :322); the folders are `Data/Platform/Plugins;Data/Platform/PluginsDev`
  (Settings.cpp:33-34); the clear drops every event and hook handler
  (EventsApi.cpp:82) and skymp5-client registers them again at its start
  (skymp5-client/src/services/services/skympClient.ts:82 calling
  sync/animation.ts:362); its entry is deferred to the first tick with a note
  about hot reload (skymp5-client/src/index.ts:150-152); `storage` is
  documented as kept (docs/skyrim_platform/features.md:3-5) but the proxy is
  created per plugin load in this tree (Sp3Api.cpp:136), so skympClient.ts:31-46
  would find no AuthGameData and log in again; `writePlugin` writes into the
  first folder (DevApi.cpp:112, GetPluginPath's `pluginFolders->front()`) and a folder outside the list is not watched
  (DevApi.cpp:91).
- The server's gamemode reload: a chokidar watcher with `awaitWriteFinish`
  and a one-second debounce re-requires gamemode.js
  (skymp5-server/ts/index.ts:151-179); the lab mounts lab/gamemode read-only
  (docker-compose.yml:36) and `deploy-srv` rsyncs it (justfile:255).
- The wire's version check: `SCHEMA_VERSION` 17
  (skymp-wire/crates/wire-schema/src/lib.rs:35); the netcode protocol id
  carries it (wire-transport/src/lib.rs:186-190); the validator refuses a
  Hello that differs, `E_VAL_SCHEMA_VERSION` (wire-validate/src/lib.rs:23,
  :549); wire-client-ffi links wire-schema, wire-json, wire-validate and
  wire-transport (wire-client-ffi/Cargo.toml:17-20).
- Files into a clone: small ones through the guest agent's stdin
  (lab/tools/stage-client.sh:12-17, three tries); anything past a few hundred
  KB over the in-VLAN hop (scp to sky-srv:/srv/lab/handover, a throwaway
  `python3 -m http.server` on 10.10.70.10:8765, Invoke-WebRequest in the
  guest, SHA256 checked; stage-client.sh:38-52;
  lab/deploy/sky-client/README.md:37-40). The one-file precedent is
  lab-driver.js, copied into every game folder's Data\Platform\Plugins with
  the game stopped (lab/tools/client-driver.sh:29-36). skymp5-client.js is
  1.6 MB with its inline source map (skymp5-client/webpack.config.js:66-67, a
  development-mode bundle with `devtool: 'inline-source-map'`), so it takes the hop.
- The stage's lay: lab/tools/verb-stage.sh:154-186 (deploy-srv, the tag
  switch and `compose pull && up -d`, the hold retaken after lab-api's
  restart, `build-client`, client-dist on 712 then 711, up to two attempts each and the second only after a failure (:172-177), the
  driver, two snapshots); REUSE_DIST at :45-67; the Windows wait at :68-93.
- The seats: c1 is VM 711 profile 1 and c2 is VM 712 profile 2
  (lab/tools/playtest-relaunch.sh:11); streams test1 48989 and test2 49989
  (lab/playtests/24.yaml:49-52); the machines at docs/LAB.md:57-59.
- The hold: `POST /lab/hold` refuses /run, /runset, /up and /down with 409
  and holds the nightly (docs/LAB.md:384); the playtest tools take 180 min
  (playtest-world.sh:22, playtest-relaunch.sh:15); verb-stage takes 90
  (verb-stage.sh:153).
- Rollback primitives: `rollback_sequence` is stop, snapshot rollback, start
  (lab/labapi/labapi/proxmox.py:134-138); the clones roll back to
  clean-m1-next (lab/labapi/labapi/guests.yaml:30-31); a run's rollback erases
  anything laid after the snapshot (client-driver.sh:4-6); no client-only
  rollback route exists in lab-api (app.py's routes, :150-489).

## 5. Unmeasured, listed

A Windows vcpkg cache miss (none since 2026-10-02); a local `yarn build`; the
hot reload's latency and skymp5-client's behaviour across one; `docker
compose pull` and `up -d` of a new tag on sky-srv; the container's start to
listening; `client-dist.sh` end to end; `client-snapshot` and
`client-promote` end to end (stamps put two promotions 30 to 60 s apart); the
fork's `client-build` job on a Windows runner (never ran); an incremental
MSBuild of skyrim-platform alone; a DLL-only lay of MpClientPlugin.dll (no
tooling).

## The hot reload, measured (2026-10-19 02:5x to 03:19 PDT)

numidium's live test of `turbo-client --hot` on c1: Skyrim Platform's
DirectoryMonitor reloaded skymp5-client.js 8 ms after a touch of its
last-write time; skympClient's establishConnectionConditional skipped the
login because the native client was still connected; and the reloaded client
sent no movement (two 600 px turns left the server's rot at 0, while the
control seat gave 26.9 degrees). The cause, read in the trees (an agent,
03:1x): the embedded assets/storageProxy.js runs on every plugin (re)load
and built `new Proxy({}, ...)`, so `sp.storage` was empty after a reload,
against docs/skyrim_platform/features.md:5 ("all variables are reset,
except for storage and its properties"), which skymp5-client is written to
(its world model, id manager, auth data, view and server address live
there). With the storage empty and `isConnected()` (a Rust static,
wire-client-ffi/src/lib.rs) still true, no login ran, no CreateActor isMe
came, `playerCharacterFormIdx` stayed -1, and NetworkingService dropped
every idx-addressed send (networkingService.ts:40-42): movement,
animation, equipment, actions; SpellCast went out with caster 0;
PlayerGlobals and the clock, sent once per login, stayed stuck.

The fix (fork m2-train-28 b93e8b37): the Proxy's target lives on
`globalThis.__skyrimPlatformStorage`, which ClearState never touches, so
storage survives the reload as documented; one storage shared by every
plugin in the folder, as before SP3 (lab-driver reads no storage key). It
needs the Skyrim Platform build (class (d)), then the probe: touch the
bundle, expect "Recovered AuthGameData from storage" and "Previous View
destroyed" in the SP log with no "Form with idx N not found", about 27
degrees of server rot after a 600 px turn on both seats, a Hit with the
right target, a SpellCast with the player's refr id as caster, an equip
toggle seen. Still lost across a reload even then: magicEffectsService's
held sums (a class field; a double-apply on the next MagicEffects),
deathService's state, pending promises and `once('update')` callbacks, and
about a second of view while the new view waits. Until the probe passes,
every TypeScript push relaunches (65 s to both seats, measured; 32 s for
one), which `turbo-client` does by default.
