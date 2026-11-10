# Rotfern's Fixes

One SKSE plugin (RotfernsFixes.dll) for the engine bugs the lab reads and Eli decides to fix for
every player, ESP-less, keyed by Address Library id, each fix with a research page as its spec.
Eli's call of 2026-11-06 ("also yes lets go with B", then "sure if we're patching novel breaks let's do it.
let's create a patch called rotferns fixes that will contain anything we need like that") on the
terrain-overlay race put the first one here and named the plugin; a lab-only patch of the seats was refused on principle (the seats run the players' game), so
the fix is a layer row every client loads.

Fixes:

| fix | site (1.6.1170) | spec | log line when it lands |
| --- | --- | --- | --- |
| terrain-overlay null check | id 18789 + 0x14A | docs/research/terrain-upgrade-crash.md | `terrain-overlay null check installed at SkyrimSE.exe+2AD22A ...`, then `... skipped N quads so far` when it fires |

Each fix checks the runtime (1.6.1170 only, ADR-022) and the bytes at its site and at its jump-back
targets before writing, logs exactly one of `installed`, `wrong runtime`, `bytes mismatch`, and, when
it skips work, a `skipped N ... so far` line every ten seconds the count moved, all to
Documents\My Games\Skyrim Special Edition\SKSE\rotferns-fixes.log, appended across launches with each line dated
(since 0.1.1). Those words are a contract:
a scenario may count them; the skip count is what proves a fix fired, since a rare crash's absence
proves nothing by itself (numidium's rules review, 2026-11-06). The count is reported at most every ten
seconds and not at quit, so a run reads it at least 11 s after the load-in. Rule 2 (docs/LAB.md): a site is a decompiler read until the run set
proves it; the proof for the first fix is a run set with no SkyrimSE.exe+02AD242 fault across the
containers gate on both seats.

## Build (sky-build 720)

The fork's client-build job's toolchain (skymp/.gitlab-ci.yml: VS 2022 Build Tools, CMake, vcpkg
in manifest mode), as the CI job rotferns-fixes-build on the `windows` runner (automatic on main
when the sources change, manual on a branch), or by hand with the same lines. fmt is pinned to the
fork's 11.2.0 through overlay_ports/fmt, a copy of the fork's own overlay port. The
Windows box is the fork's only runner: no hand build and no push that queues a Windows job while a
client build is in flight (numidium's word, 2026-11-06).

```powershell
# from a thuum checkout with the CommonLibSSE-NG submodule present; <vcpkg> is a vcpkg clone
# (the fork's submodule or C:\vcpkg), bootstrapped once with .\bootstrap-vcpkg.bat -disableMetrics
$env:VCPKG_BINARY_SOURCES = "clear;files,D:/vcpkg-bincache,read;files,D:/thuum-vcpkg-bincache,readwrite"
$env:VCPKG_FEATURE_FLAGS = "manifests"
cd lab\rotferns-fixes
cmake -B build -G "Visual Studio 17 2022" -A x64 `
  -DCMAKE_TOOLCHAIN_FILE=<vcpkg>\scripts\buildsystems\vcpkg.cmake `
  -DVCPKG_TARGET_TRIPLET=x64-windows-static-md
cmake --build build --config Release
cmake --install build --config Release --prefix dist
```

`dist\SKSE\Plugins\RotfernsFixes.dll` and its `.pdb` (Crash Logger reads pdbs) are the job's
artifact, and the layer row takes that artifact, never a hand-built copy (ADR-069 decision 4): an
essentials row of source `ci` names the job and the folder inside its artifact
(`thuum/<job id>|lab/rotferns-fixes/dist`) with the artifact's tree hash, and persist-mods fetches it
once into lab/.cache/mods/ci/thuum-<job id> with `lab/tools/glab.py artifact` and checks it like any
staging folder. The job's artifacts never expire. A hand build on sky-build proves a detour; it is
not a row's source.

## Reading a site

docs/research/tools/disasm-chain.py over a copy of the unpacked image (copied off core from
/rpool/sky/persist/game; analysis never runs on the Proxmox host) or on sky-re, with the Address
Library database (addrlib/): the detour's bytes, its resume and skip points, the
inbound branches into the patched range (must be none) and the scratch register the function leaves
free are all read before a fix is written, and recorded on its page.
