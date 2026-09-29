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
