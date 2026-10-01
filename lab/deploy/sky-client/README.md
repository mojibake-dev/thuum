# sky-client staging bundle

What `just stage-client <vmid>` puts under `C:\sky-lab` on a lab client VM
(tpl-sky-client 710 tonight, sky-c1 711 once it exists) through the QEMU guest
agent, and nothing anywhere else: the game, SKSE and Skyrim Platform are Eli's
layer (docs/LAB.md, the 1.6.1170 pin).

```
C:\sky-lab\
  lab-driver.js                the SP plugin (lab/driver, `just build-driver`)
  lab-driver-settings.txt      lab-api base, client name (c1 by default)
  skymp5-client-settings.txt   server 10.10.70.10:7777, profileId 1, no server info
  register-runner.ps1          registers sky-lab-run, the on-demand task that runs run.ps1 in
                               the lab user's desktop session (`just client-run <vmid> <ps1>`)
  install-layer.ps1            lays SKSE (from skse\) and versionlib-*.bin (from addrlib\)
                               into the game, once Steam has installed it
  install-lab.ps1              copies the three files into Data\Platform\Plugins,
                               records game-dir.txt, registers the two tasks
  launch.ps1                   sky-lab-launch, at logon of `lab`: starts skse64_loader
  screenshot.ps1               sky-lab-screenshot, on demand: primary screen to
                               screenshots\latest.png (interactive session)
  client-dist.zip, dist\       the mirror's Windows workflow output when
                               `just build-client` fetched it: Skyrim Platform and
                               skymp5-client, for Eli to lay into the game
```

Once SKSE and SP are installed, apply it (as an administrator in the VM or
through guest exec):

    powershell -ExecutionPolicy Bypass -File C:\sky-lab\install-lab.ps1

The small files go in through the agent's stdin; the client dist (hundreds
of MB) is zipped, copied to sky-srv over the jump, served for a minute by a
throwaway python http.server on 10.10.70.10, fetched by the guest inside
VLAN 70, hash-checked and expanded. Nothing leaves the lab network.

Then the template snapshot `clean-sp` carries it and every clone boots to
"connected" by itself (docs/LAB.md). For a second client change `client` and
`profileId` before installing.

## Driving a client from the laptop

Moonlight (`brew install --cask moonlight` on the Mac) to the host's external
base port for the client: `10.0.0.10:48989` on the LAN or
`core.gaussing.tv:48989` on the tailnet reaches the template today and
sky-c1 once it exists; `49989` is sky-c2. The first connection shows a PIN;
enter it at https://core.gaussing.tv:48990 (user `lab`, password in the Mac
Keychain under sky-client/sunshine). Sunshine's default app is the desktop,
which is enough to log into Steam and install the game.
Pairing from the Mac without touching the web UI: run Moonlight's pairing
helper with a chosen PIN, read the pending request's id from Sunshine's API
and post the PIN with it, then let the helper finish on its own:

```
security find-generic-password -s sky-client -a sunshine -w        # Sunshine password
/Applications/Moonlight.app/Contents/MacOS/Moonlight pair core.gaussing.tv:48989 --pin 1234 &
curl -k -u lab:PASSWORD https://core.gaussing.tv:48990/api/pin      # {"pairings":[{"id":...,"name":"roth"}]}
curl -k -u lab:PASSWORD -H 'Content-Type: application/json' -X POST https://core.gaussing.tv:48990/api/pin \
     -d '{"pairing_id":"<id>","pin":"1234","name":"roth"}'
```

An interrupted attempt leaves a stale session in Sunshine that makes the next
attempt fail with "The client is not authorized. Certificate verification
failed."; restart SunshineService (or `just client-sunshine-port <vmid>
<base>`, which restarts it) and pair once more.

Each client's Sunshine runs on its own base port (the template and sky-c1 on
48989, sky-c2 on 49989, set with `just client-sunshine-port`), mapped one to one
by the host, because Moonlight follows the HTTPS port Sunshine advertises.

## Display on a headless clone

The template carries the Virtual Display Driver (VirtualDrivers 25.7.23,
installed by `sky-lab client stage` on 2026-09-29) so a clone whose only
adapter is the passed-through GPU still has a monitor for D3D11 and Sunshine
capture. Its one knob is `C:\VirtualDisplayDriver\vdd_settings.xml` (monitor
count, mode list incl. 1920x1080 at 60 Hz). A fresh clone comes up at 800x600
at 30 Hz, the first mode in that list; `just client-display <vmid>`
(display.ps1 in the lab user's session) switches the primary display to
1920x1080 at 60 Hz with the change written to the registry, and sets the
game's SkyrimPrefs.ini to the same size, windowed and borderless, so the frame
fills what Sunshine and the screenshot task capture. The launch test reports
the game window's size and the Direct3D user-mode driver it loaded
(`nvwgf2umx.dll` is the NVIDIA one; `d3d10warp.dll` means software rendering,
the state before `just client-gpu-driver`).

## The game's traffic outside the lab

The lab VLAN is dark by dropping, and SkyrimSE.exe opens TCP connections to
bethesda.net from the main menu (Creations, the bnet login). With the SYNs
dropped the game sits in connect() retries and Skyrim Platform never gets its
first tick: on sky-c1 on 2026-10-01 the same client that had logged in within
two minutes while the egress lease was open showed four SynSent sockets to
99.84.41.x:443 and no plugin load in ten minutes once the lab was dark again.
`just client-game-firewall <vmid>` (game-firewall.ps1 as SYSTEM) adds a
Windows Firewall rule that blocks the exe outside 10.10.70.0/24, so those
connections are refused at once, the case the game handles; with the rule the
client logged in ten seconds after launch. The server (UDP 7777, TCP 3000) and
lab-api (TCP 80 on sky-srv) are inside the allowed range; DNS is the Windows
resolver's, not the exe's, and is untouched.

## The logon launcher

`launch.ps1`, run by the task `sky-lab-launch` at the lab user's logon, waits
for Steam's process plus 20 s, starts the game through the SKSE loader, and
starts it again up to twice when the game is gone 30 s after a launch. The
retry is not decoration: the game is Steam-wrapped and exits at once (status
0x35 in the Security log, no SKSE log) when launched before Steam has
finished its own startup, which sky-c2 hit on its first rollback boot while
sky-c1 had won that race every time, and Steam exposes no readiness signal
in offline mode (`ActiveUser` stays 0 there). The same retry covers the
occasional silent exit after the generated save loads. It logs to
`C:\sky-lab\launch.log`.

## Steam on a dark boot

Steam is the game's launcher and licence check, and on a cold boot inside the
dark lab it never logs in: it loops on CM pings (connection_log.txt, "failed
talking to cm" every second with the fail-fast lock), and SkyrimSE.exe
started by the SKSE loader exits before SKSE writes its log, so the logon
task's launch produces no heartbeat. Every launch test that passed before
2026-10-01 rode the template's still-running online session. The answer is
Steam's own offline mode, persisted the way the client's "Go Offline" menu
does it: `WantsOfflineMode` and `SkipOfflineModeWarning` set to 1 for the
remembered account in `config\loginusers.vdf`. `just client-steam-offline
<vmid>` (steam-offline.ps1 in the lab user's session) shuts Steam down, sets
them, starts it again; a launch test after it ends logged in. Offline mode
needs one online login with "Remember me" and one online run of the game,
both done in the template; its ticket ages with the wall clock, so if a far
future rollback boot shows Steam asking for a login, the fix is an egress
lease, Go Online, Go Offline, and a retaken snapshot.

## Crash dumps

`just client-crash-dumps <vmid>` sets Windows Error Reporting's LocalDumps
policy for SkyrimSE.exe (minidump, five kept, under `C:\sky-lab\dumps`),
part of bring-up. The game left the desktop three times on 2026-10-01 with
no dialog, no application error event and nothing for WER to catch; with the
policy in place a crash leaves a dump, and an exit that still leaves nothing
was a deliberate ExitProcess, which narrows the search to the plugins.

## Tracing the game

`just client-frida <vmid>` stages Frida's standalone injector into
`C:\sky-lab\frida` (lab/frida/README.md); `just frida <script> <client>` then
runs a script from lab/frida/ inside the game through lab-api, which waits
for the process, attaches five seconds in and keeps the injector's stdout as
the run's frida artifact. The crash-dump step also turns on process
termination auditing, so an exit's status shows in the Security log (event
4689) even when nothing else records it.

## A driver change

`just client-driver <vmid>` builds lab-driver, pushes the bundle into the
game's Data\Platform\Plugins on the clone, relaunches through the launch
test, confirms the login and the heartbeat, and stops the game. The clone's
`clean-sp` snapshot must then be retaken cold by thuum-mundus (`sky-lab
snapshot <vmid> clean-sp --cold`), because lab-api's rollback restores the
snapshot and would erase the new bundle. The game exits silently now and
then right after its generated save loads (twice on 2026-10-01, both on a
relaunch inside a running session, never on a cold boot); the launch step
retries once.

## The NVIDIA driver, per card family

NVIDIA split Pascal (the GTX 1050 on sky-c1) into its own driver branch in
2025, and a Pascal package refuses a Blackwell card (the RTX 5060 Ti on
sky-c2) with exit -436207360 and no log at all, on any boot; on 2026-10-01
that looked like a passthrough problem for an hour. `just gpu-driver-fetch`
fetches both families into `lab/.cache/nvidia-driver-<family>.exe` through
NVIDIA's lookup, and `just client-gpu-driver <vmid>` picks the package by the
card's PCI device id (GP107 1C83: pascal; GB2xx: blackwell) before the hop.

## Clone bring-up

`just client-bringup <vmid> <sunshine base> [client] [profile]` runs the per-clone steps in order
once thuum-mundus's `sky-lab` has given the clone its address: Sunshine base
port, NVIDIA driver, display mode, game firewall, Steam offline, crash dumps,
the current client dist (`just client-dist`, since the template's is stale
whenever the fork moves), the clone's identity (`just client-identity`: the
scenario client name lab-driver reports as and the profile id the game logs
in with; sky-c1 is c1 / 1, sky-c2 is c2 / 2), launch test.
The template is immutable (converted 2026-10-01), so every clone needs them;
sky-c1 (711) is done, sky-c2 (712) gets base 49989 when fenestrate is off.
A clone's `clean-sp` snapshot, the one lab-api rolls back to, is taken after
this with the game stopped and the VM shut down (`sky-lab snapshot <vmid>
clean-sp --cold`): a snapshot of a running Windows is a power-cut image, and
the first boot from one on 2026-10-01 logged a 45 s start timeout for the
QEMU guest agent and a last-alive stamp 13 minutes older than the snapshot.
