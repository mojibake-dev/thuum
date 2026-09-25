# lab-api

The scenario runner of docs/LAB.md, as a small FastAPI service on sky-srv
(port 80, root path `/lab`, reached from the Mac at
https://thuum.gaussing.tv/lab through Caddy). It owns runs, hands steps to
lab-driver, talks to Proxmox for the client guests, to docker compose for the
server, and to the server's RPC hook for state (CONTRACT.md).

No auth: the Caddy vhost is LAN and tailnet only and is the boundary; inside
VLAN 70 the clients reach :80 directly.

## Endpoints

The table in docs/LAB.md is the contract; `labapi/app.py` is the code. In
short: `POST /lab/up`, `POST /lab/down`, `GET /lab/status`, `POST /lab/run`
(multipart field `scenario`, answers `{"run": id}` at once), `GET
/lab/run/<id>` (progress, then result.json), `GET /lab/step?client=<id>`
(lab-driver's poll and heartbeat), `POST /lab/step/<id>/result`, `POST
/lab/frida` (form: `client`, plus `script` name or a `file` upload), `GET
/lab/frida/scripts/<name>`, and `GET|POST /lab/state/<path>` (pass-through to
the server's UI port).

## Runs

Phases: rollback-server, netem (when the scenario asks), rollback-clients,
steps, artifacts. A run's directory is `RESULTS_DIR/<utc stamp>-<scenario
id>/` with `result.json`, `world-before/`, `world-after/`, `world-diff`,
`server.log`, `screenshots/`, `lab.pcap`, `frida/`, and client logs when the
scenario lists them. The verdict is green only when every assertion held and
no step timed out; red when an assertion failed, a step timed out, or the
server refused a command; error when the lab itself failed (no snapshot, the
server never became ready, a client never heartbeated, the scenario timed
out, an assertion that is not in the language).

Server rollback runs in `state` mode by default: stop the server container,
restore `SERVER_WORLD_DIR` from `SERVER_SNAPSHOTS_DIR/<snapshot>/`, `docker
compose up -d`, wait for the UI port. lab-api runs on sky-srv and therefore
cannot roll back the VM it lives in; docs/LAB.md's "stop, rollback, start"
of sky-srv is the operator's `sky-lab` action between scenario sets, and
`SERVER_ROLLBACK_MODE=vm` exists only for a lab-api that runs elsewhere.
Client rollback is the disk-only sequence (stop, rollback, start, wait for
the heartbeat) on managed guests; fenestrate and any `managed: false` guest
is never touched, lab-api only waits for its heartbeat.

Server-side verbs (`teleport`, `give`) go to the server's `labCommand` RPC;
client verbs (`connect`, `reconnect`, `move`, `equip`, `cast`, `activate`,
`hit`, `dump-state`) are queued for lab-driver; `screenshot` is a guest exec
plus guest-agent file read on a managed guest (the helper writes a base64
text file beside the PNG because the guest-agent file API carries text
only), and a `request-screenshot` client verb on an unmanaged one.
`wait: N` sleeps N times `TIME_SCALE`. Before an `assert:` block, every
client the block reads through `.sees()` or `.view()` gets a `dump-state`
step so the view is fresh.

The scenario step notation `- c1: teleport {cell: lab-spawn, x: 0}` is not
plain YAML (the colon inside the braces ends the scalar); the loader quotes
such values before parsing, and the quoted form is accepted as well.

## Assertions

A restricted expression language evaluated over Python's ast, never through
eval: `server.actor(c1).x|y|z|cell`, `server.inventory(c1).count("File.esm:EditorID")`,
`c1.sees(c2)`, `c2.view(c1).x|y|z`, `abs()`, arithmetic, comparisons, `and`,
`or`, `not`, `true`, `false`. Anything else is `E_ASSERT_SYNTAX` and turns
the run's verdict to error, because it is a bug in the scenario, not in the
game.

## Configuration (environment)

| variable | default | meaning |
| --- | --- | --- |
| LAB_ROOT_PATH | /lab | path prefix all routes live under |
| LAB_LISTEN_PORT | 80 | listen port |
| PVE_URL | https://10.0.0.10:8006 | Proxmox API, by IP |
| PVE_TOKEN_ID | | `user@realm!tokenname`, pool-scoped |
| PVE_TOKEN_SECRET | | the token secret |
| PVE_NODE | core | Proxmox node name |
| PVE_VERIFY_SSL | true | verify the API certificate |
| RESULTS_DIR | /srv/lab/results | run directories (rpool/sky/results) |
| GUESTS_FILE | labapi/labapi/guests.yaml | guest, client, and item tables |
| COMPOSE_FILE | /srv/skymp/docker-compose.yml | the server's compose file |
| COMPOSE_SERVICE | skymp-server | the server service name |
| SERVER_WORLD_DIR | /srv/skymp/server/world | the file driver's directory |
| SERVER_SNAPSHOTS_DIR | /srv/skymp/snapshots | `<snapshot>/` copies of world/ |
| SERVER_UI_PORT | 3000 | readiness probe (tcp) |
| SERVER_SNAPSHOT_DEFAULT | clean | snapshot for `/up` and `/down` |
| SERVER_ROLLBACK_MODE | state | `state` or `vm` (see above) |
| SERVER_STATE_URL | http://127.0.0.1:3000 | the server's UI base, where the RPC hook lives (CONTRACT.md) |
| LAB_API_INTERNAL_URL | http://10.10.70.10/lab | what clients pull scripts from |
| FRIDA_SCRIPTS_DIR | lab/frida | scripts served to clients |
| NETEM_DEV | eth0 | interface for tc netem |
| PCAP_IFACE | any | tcpdump interface |
| GAME_PORT | 7777 | udp port captured |
| CLIENT_LAB_DIR | C:\lab | lab-driver and helpers on a client |
| FRIDA_EXEC_TEMPLATE | see config.py | PowerShell run through the guest agent |
| SCREENSHOT_CMD_TEMPLATE | see config.py | PowerShell screenshot helper |
| STEP_TIMEOUT_S | 60 | per client step |
| HEARTBEAT_TIMEOUT_S | 180 | client rollback to first poll |
| SERVER_READY_TIMEOUT_S | 120 | server rollback to UI port |
| GUEST_TASK_TIMEOUT_S | 120 | Proxmox tasks and guest execs |
| TIME_SCALE | 1.0 | multiplies `wait:` and the scenario timeout |

## Running

Locally on the fakes (no Proxmox, no server, no clients):

```
just labapi-dev          # uvicorn on http://127.0.0.1:8080/lab
just test-labapi         # unit tests through uv
```

On sky-srv: `docker-compose.yml` here is the fragment for the host's compose
file; lab-api runs beside the legacy server container (image
`skymp-server:parity` from the fork's `ci/server.Dockerfile`; its entrypoint
is settled in Track S1) with the results dataset and the docker socket
mounted, `network_mode: host` so it can probe the server's ports and run
`tc` and `tcpdump` (`cap_add: NET_ADMIN, NET_RAW`).

## Client side

lab-driver polls `GET /lab/step?client=<name>` on the update tick; the poll is
the heartbeat. A step is `{"id": "s12", "action": "move", "args": {...}}`;
the client answers `POST /lab/step/s12/result` with `{"ok": true, "data":
{...}}`. For `dump-state` the data is `{"self": {"x": .., "y": .., "z": ..,
"cell": ".."}, "sees": {"c2": {"x": .., "y": .., "z": ..}}}`; for
`request-screenshot` it is `{"png_b64": "..."}`.
