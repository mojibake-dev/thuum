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
Each client's Sunshine runs on its own base port (the template and sky-c1 on
48989, sky-c2 on 49989, set with `just client-sunshine-port`), mapped one to one
by the host, because Moonlight follows the HTTPS port Sunshine advertises.

## Display on a headless clone

The template carries the Virtual Display Driver (VirtualDrivers 25.7.23,
installed by `sky-lab client stage` on 2026-09-29) so a clone whose only
adapter is the passed-through GPU still has a monitor for D3D11 and Sunshine
capture. Its one knob is `C:\VirtualDisplayDriver\vdd_settings.xml` (monitor
count, mode list incl. 1920x1080 at 60 Hz).
