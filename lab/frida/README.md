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

Stop a script by ending frida-inject; check afterwards that the game no longer
lists frida-agent.dll. A script that walks the stack on every memory commit
(NtAllocateVirtualMemory) never reported and stayed loaded after its injector
was killed (sky-c2, 2026-10-05); hook rarer functions, or sample.
