# sky-srv layout

`just deploy-srv` puts this on sky-srv (VM 700) over ssh through the host jump:

```
/srv/lab/
  docker-compose.yml        this directory's compose file
  .env                      from env.example, filled by hand once (secrets)
  server/
    server-settings.json    this directory's settings (offline, file driver, lab gamemode)
    data/                   writable data dir the server fills (ui/, manifest)
    world/                  the file driver's database; snapshots copy it
  snapshots/<name>/world/   server state snapshots lab-api restores per scenario
  thuum/                    a copy of the superproject's lab/ tree (gamemode, presets, frida, scenarios)
  results/                  the host dataset (virtio-fs), served at https://thuum.gaussing.tv/results/
/srv/persist/esm/           the five master files, read-only, Eli's hand step
/srv/persist/pve-root-ca.pem the Proxmox cluster CA, published by the estate role; lab-api verifies the API against it
```

Images are built on sky-ci by the two pipelines and pulled through the
registry named in `.env`; sky-srv has no internet by design. Start with
`docker compose -f /srv/lab/docker-compose.yml up -d` once the ESMs exist and
`.env` is filled; lab-api then answers at https://thuum.gaussing.tv/lab/status.
