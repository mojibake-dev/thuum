# lab/frida

Frida scripts lab-api serves to clients (`GET /lab/frida/scripts/<name>`) and
runs on them (`POST /lab/frida`, `just frida <script> <client>`). The client
side is Frida's standalone injector, frida-inject 17.19.0 for Windows x86_64
(the release's `frida-inject-<ver>-windows-x86_64.exe.xz`, unxz'd into
lab/.cache/frida/ and staged into C:\sky-lab\frida by `just client-frida
<vmid>`); it attaches to SkyrimSE.exe by name, loads the script, and prints
`console.log` lines and `send()` payloads to its stdout, which lab-api redirects
to C:\sky-lab\frida\<script>.out and reads back as an artifact. Attaching at
process start failed once (the agent never loaded before the game died); from a
few seconds in it works, so lab-api waits for the process and five seconds more.
The injector must run in the lab user's session, the game's own: as SYSTEM
through the guest agent it reported "refused to load frida-agent" on both
clones (2026-10-05), so lab-api hands its watcher to the sky-lab-run task.

Scripts use Frida 17's API: a module's exports come from its Module object
(`Process.getModuleByName(m).findExportByName(n)`); the static
`Module.findExportByName(m, n)` is gone in 17 and throws "not a function".

- exit-trace.js: who ends the process. A first-chance exception handler
  (module+offset, backtrace, registers) plus hooks on every orderly exit path.
  Found the 1.7.104 appearance crash on 2026-10-01 (docs/verbs/appearance.md).
  Until 2026-10-05 its exit hooks never loaded (the static call above threw
  right after the exception handler was set), so only the handler ran.
- handle-trace.js: who leaks handles. Records the stack of every handle the
  listed creators return (NtCreateEvent, NtOpenEvent; one row per creator),
  forgets what NtClose closes, and every 30 s prints the stacks of the handles
  still open after 10 s. Found the idle-client leak on 2026-10-05: WinHTTP
  requests from SkyrimSE.exe to api.bethesda.net, two Event handles each, never
  closed (lab/deploy/sky-client/README.md, "The game's traffic outside the
  lab"). Pair it with Sysinternals Handle (`handle64 -s -p <pid>`, staged in
  C:\sky-lab\tools) to pick the leaking type first.
- console-trace.js: every line the game's console prints, timed. Skyrim
  Platform's printConsole and its JavaScript exceptions end there, so a run
  keeps skymp5-client's own trace lines (logTrace, logError) and each item
  an inventory apply adds. Hooks RE::ConsoleLog::VPrint at its Address
  Library offset for the exe's own file version (1.6.1170 and 1.7.104).

- face-dump.js: what the renderer holds for a face right now. A read-only
  walk of the player's and every figure's loaded 3D (one call into the game,
  LookupReferenceByHandle, to turn the process list's actor handles into
  references) that prints one line per face geometry: shader property class
  and flags, material class and specular colour, power and scale, every bound
  texture with its live D3D11 size and format (ID3D11Texture2D::GetDesc), and
  the texture set's paths. Hooks nothing, so it can attach to a game in play;
  each resolved reference keeps one extra reference count. Found rotfern's
  gloss on 2026-10-07: her head's specular slot bound to BSShader_DefNormalMap,
  the engine's stand-in for a texture that did not load, because the mesh
  named a dependency's files (docs/verbs/racemenu-sync.md). Offsets are
  CommonLibSSE-NG's for 1.6.1170, cited per field; mind that a two-number
  REL::RelocateMember is (SE and AE, VR), and a RelocateMemberIfNewer shifts
  every field comment of its struct by the newer start.

A trace ends with the game: restart it (or let the next rollback do so) once
the .out has what you need. A run collects the traces started during it as
frida/<client>-<script>.jsonl; one started outside a run is fetched by the next
run just before its rollback, as frida/<client>-<script>.before-run.jsonl. Never kill frida-inject under a running game. On
2026-10-05 that left sky-c1's game to crash ten minutes later inside
frida-agent.dll_unloaded (WER event 1000, 0xC0000005), and on sky-c2 the agent
stayed loaded. Read the first lines of the .out right after attaching: a
script that throws at load still prints its error there. A script that walks
the stack on every memory commit (NtAllocateVirtualMemory) never reported;
hook rarer functions, or sample.
