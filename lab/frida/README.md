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

- exit-trace.js: who ends the process. A first-chance exception handler
  (module+offset, backtrace, registers) plus hooks on every orderly exit path.
  Found the 1.7.104 appearance crash on 2026-10-01 (docs/verbs/appearance.md).
