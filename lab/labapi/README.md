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
scenario lists them. A Frida trace, `frida/<client>-<script>.jsonl` (the
injector's .out, then the script's .log), is copied on the seat by a read
that shares write access, the copy exec printing the copy's length (three
tries, 10 s apart, but one for an exec that ran to its deadline), and read back by Proxmox's own ranged agent file-read
(offset, count, decode=0), 512 KiB a call, joined as bytes, checked against
the copy's length and decoded as UTF-8 once; a copy past 64 MiB is refused
before its first read, and the copy is removed once read (one the agent
holds open rolls the seat back: in the same run's reset when the fetch came
before it, else at its next run). A copy or sidecar counts as held only when
its removal still finds it at the fourth of four tries 1 s apart, each try
before that a note, since a scan of a file just written can hold it a moment
(train 52's stage, numidium's HYPOTHESIS). A client log (`<client>.log`, `-driver.log`,
`-console.log`, `-before.log`, `-launch.log`, a relaunch's
`-relaunch-<step>.log` and `-console.log`) comes back the same way, since the
game holds its logs open for writing. `c1.log` in a scenario's artifacts
brings c1's one fetch, its driver and console logs with it, and so does a
seat's named log listed itself (`c1-console.log`, `c1-driver.log`), made once
however many of them are listed. One not fetched is a note ending
"(log fetch)" with its code, E_PVE_* or E_RUN_LOG_FETCH, never a failure. The
SKSE folders' logs are still copied by Copy-Item and read whole. The verdict is green only
when every assertion held and no step timed out; red when an assertion
failed, a step timed out, or the server refused a command; error when the
lab itself failed (no snapshot, the server never became ready, a client
never heartbeated, the scenario timed out, an assertion that is not in the
language, an exception out of the artifacts phase in a run not already red, a trace the run's own
frida step or relaunch arm started that its end could not fetch whole).
That last is E_RUN_FRIDA_FETCH, naming the script, the seat and the reason
(its copy failed three tries or its exec answer was lost, a range still unread after the file read's
retries, a range that came back as no base64, bytes that do not come to the
copy's length, a copy past 64 MiB); as for a crash at the end, a red run
stays red and gains the failure. A trace started by hand (POST /lab/frida)
is no run's evidence: what of it is not fetched is a note.

Server rollback runs in `state` mode by default: stop the server container,
restore `SERVER_WORLD_DIR` from `SERVER_SNAPSHOTS_DIR/<snapshot>/`, `docker
compose up -d`, wait for the UI port. lab-api runs on sky-srv and therefore
cannot roll back the VM it lives in; docs/LAB.md's "stop, rollback, start"
of sky-srv is the operator's `sky-lab` action between scenario sets, and
`SERVER_ROLLBACK_MODE=vm` exists only for a lab-api that runs elsewhere.
Client rollback is the disk-only sequence (stop, rollback, start, wait for
the heartbeat) on managed guests; fenestrate and any `managed: false` guest
is never touched, lab-api only waits for its heartbeat. Under
`LAB_CLIENT_RESET=relaunch` a managed seat's game is relaunched and its run
files cleaned instead, with the VM left running, unless something asks for
the rollback (ADR-036; docs/LAB.md, "Between runs"); result.json's
`client_reset` says which each seat got and why.

Server-side verbs (`teleport`, `give`) go to the server's `labCommand` RPC;
client verbs (`connect`, `reconnect`, `move`, `equip`, `cast`, `activate`,
`hit`, `dump-state`) are queued for lab-driver; `screenshot` is a guest exec
on a managed guest whose helper writes a base64 sidecar beside the PNG, read
back through the agent's ranged file-read (512 KiB a call, decoded once
joined, removed once read, as a client log is: a whole read past about 1 MiB
is unreliable on a busy seat), a burst's frames likewise, and a
`request-screenshot` client verb on an unmanaged one; a shot or frame not
read is the step's note, never a fault, but a sidecar held open after its
read faults the seat (a rollback at its next run, the verdict unchanged), a
reversal of the 2026-10-30 soft cleaning's leniency, since held files built
up (docs/LAB.md).
`wait: N` sleeps N times `TIME_SCALE`. Before an `assert:` block, every
client the block reads through `.sees()` or `.view()` gets a `dump-state`
step so the view is fresh. `server.log_count("<regex>")` is counted from the
run's server log anew before every `assert:` and every poll of an `until:`. A
seat's `c1.log_count("<regex>")` is counted anew before each poll of an
`until:` that names it, by a `log-count {pattern}` step's own copies of the
seat's logs: each pattern once a poll, its guest-agent time measured by the log
fetch's seat check (2026-11-12, both seats: 6.5 to 6.6 s for two 6 MB logs, about
1.8 MB/s; a run's own logs are far smaller), so a poll takes that much longer
than its `every`. A known cost: every pattern copies the seat's two logs
anew, where one copy a seat a poll could serve all its patterns; that saving
is left for later. The copies come back as the
run's logs do, in ranges, each removed once read (a copy, a ranged read and a
removal a log), and one the agent holds open is the seat's fault; each count's
copies carry their step and their number there (logcount-<index>-<n>), so one
held open spoils its own poll alone, not the rest of its until; a range
that comes back short keeps no count, as does a copy whose exec answer the
agent lost, since only that exec's own lengths prove a copy whole. An `assert:` counts no
seat's log itself: it reads the last count taken, a `log-count` step's or an
until's last poll's, the moment its scenario chose to count at.

Server steps take the `server:` key: `- server: restart` restarts the server
container and waits for its UI port; `- server: fakeclient {as: c1, moves: 5,
item: "Skyrim.esm:IronSword", count: 1}` runs the fork's headless legacy
client from inside the server image (FAKECLIENT_BIN, default
/srv/skymp/fakeclient) logged in with c1's profile id, walking `moves` steps
of 30 units and adding `count` of `item` through a console command; its event
log lands in the run directory as `fakeclient-c1-<step>.jsonl`, and a
non-zero exit is a red step. A scenario with `clients: []` and fakeclient
steps is T2: it needs no Windows client, and `server.*` assertions still
resolve c1 through the clients table. `- server: snapshot {name: before, of:
"server.ref(0x85547)"}` reads a `server.` expression now and keeps it by name
for a later assert's `snapshot("before").x` (a frozen record against its
earlier read, docs/verbs/cell-host.md); a fact the server cannot give is a red
step, as in an assert. `server: {npcEnabled: true}` beside `snapshot:` gives
the run its own server setting: lab-api lays the run's version's settings
file, with only npcEnabled changed, beside the world as
server-settings-run.json and mounts that for the run (ADR-035 point 9); a run
that names none mounts the version's file as it is. `server: {gameHour: 7.9}`
rides the same overlay: its `time` block starts the server's clock at that hour
when the run's server starts (the epoch is the run's start; wire-rules
clock.rs). NPC steps for docs/verbs/npc-puppet.md: `npc-state {formId}` is kept
per seat and read as `c.npc_state(<id>).aiEnabled` (and .inCombat, .package,
.combatTarget, .staggering, .x, .y, .z; .headX, .headY, .headZ, its head node's
world position, so `headZ - z` tells a body lying from one upright; .scene, the
scene that seat's game runs it in, 0 for none; .faceNode, whether its copy holds
the facegen head node, false on a re-roll's half-built 3D); `refs-near {formTypes: [43]}` then
`c.refs_near().runtime_of(<base id>)` counts that base's runtime copies (ids
from 0xff000000), and `c.refs_near().listed(<ref id>)`, `.pos_of(<ref id>)`
and `.disabled_of(<ref id>)` read one listed reference by its own form id, not
its base's (a trap's several rocks of one base, docs/verbs/traps.md's D-S3); a `weather {read: true}` step's sky is read as
`c.weather().current` (the engine's current weather, a form id), `.outgoing`
(the one it blends from, 0 once settled) and `.transition` (the blend's
progress, 1 once settled; docs/verbs/weather.md); a watch records each actor's heading, read as
`c.watched_id(<id>).turns` (net turns) and `.headingAtStop`; the driver's
`npc-puppet {formId?, puppet}` calls the fork's setPuppet export and
`npc-pose {formId?, x, y, z, angleZ, speed, direction}` is the puppet apply in
one step, from lab-spawn as place-npc; `npc-hold {formId, held}` stands a named NPC
still in that seat's game while its AI and dialogue run (Actor.SetDontMove).
`inventory {ref}` lists a container's items in that seat's own game, a chest's or
a body's, by its reference's form id (a FormDesc or a table name is resolved
first); it is kept per seat and per reference and read as
`c.inventory(<ref>).count("File.esm:EditorID")`, the count
`server.inventory(<ref>)` makes of the server's record, so a two-seat claim sets
what each player's game shows beside the record (the root-cause plan's W4).
`transfer {item, to}` stores `count` (1 to 100, 1 when absent) of the form
`item` from that seat's player into the container reference `to`, and
`transfer {item, from}` takes them from `from` into the player, exactly one of
the two: Papyrus ObjectReference.RemoveItem with the other container, silent,
the menu's store and take without its keys (x-shared-chest-phantom;
docs/engine/containers.md section 4). The item is a form id, a FormDesc or a
table name; a reference is a form id or a FormDesc (a table name resolves to a
base form, which the driver refuses as no such ref); each is resolved first.
The answer counts the item on the player and in the container before and
after; a missing item or reference, a source holding fewer than `count`, and
counts that did not move by exactly `count` each way fail the step (the driver
throws, an `"ok": false` answer). `- server: netem {loss_pct:
25}` impairs the server's interface from that step on (delay_ms, jitter_ms and
loss_pct as `server: {netem}` takes them; all zero clears it, and the run's end
does too).

`- c2: relaunch` quits that seat's game and starts it again (a fresh generated
save at the next login) and holds until the new game is in and logged in;
`relaunch {until: gone}` returns as soon as the player is off the server's
online list, so a scenario can read the server while that game is down, and a
later `- c2: connect` waits for the new game's login. `relaunch {files: [...]}`
changes the run's game folder while the game is stopped, for what loads only
at a launch: `{rename: <path>, to: <name>}`, `{ini: <path>, section, key,
value}` for a key the ini has, or `{json: <path>, key, value}` to set or add a
key, dotted for a nested one (skymp5-client-settings.txt's `cellHost` and
`npcPuppet` switches, `gameData.profileId`). Paths are relative to the game
folder; the next rollback undoes it. `relaunch {frida: {script, params?}}` arms
a frida step's watcher while the game is stopped, so the trace starts with the
new game, ahead of Skyrim Platform's engine; a frida step after a relaunch
attaches seconds too late for anything at the login.

The scenario step notation `- c1: teleport {cell: lab-spawn, x: 0}` is not
plain YAML (the colon inside the braces ends the scalar); the loader quotes
such values before parsing, and the quoted form is accepted as well.

## Assertions

A restricted expression language evaluated over Python's ast, never through
eval: `server.actor(c1).x|y|z|cell`, `server.inventory(c1).count("File.esm:EditorID")`,
`server.inventory(<ref>)` and `c1.inventory(<ref>)` with the same `count` (a
chest's or a body's items: the server's record, and that seat's own game's at
its last `inventory {ref}` step), `c1.sees(c2)`, `c2.view(c1).x|y|z`, `abs()`,
arithmetic, comparisons, `and`, `or`, `not`, `true`, `false`. Anything else is
`E_ASSERT_SYNTAX` and turns the run's verdict to error, because it is a bug in
the scenario, not in the game.

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
| SERVER_UID, SERVER_GID | 1001 | the server container's user; a restored world/ is chowned to it |
| SERVER_PORT | 7777 | the game port fakeclient steps connect to (service name as host) |
| FAKECLIENT_BIN | /srv/skymp/fakeclient | the headless client inside the server image |
| FAKECLIENT_TIMEOUT_S | 90 | wall clock for one fakeclient step |
| HEARTBEAT_TIMEOUT_S | 300 | client rollback (or relaunch) to first poll |
| LAB_CLIENT_RESET | rollback | how a run starts each managed seat: `rollback` or `relaunch` (ADR-036, docs/LAB.md "Between runs"); anything else stops lab-api at its start |
| LAB_RELAUNCH_ROLLBACK_EVERY | 20 | under `relaunch`, a seat that has played this many runs since its last rollback rolls back |
| SERVER_READY_TIMEOUT_S | 120 | server rollback to UI port |
| GUEST_TASK_TIMEOUT_S | 120 | Proxmox tasks and guest execs |
| BEFORE_LOGS_QUIET_S | 600 | a run this long after the last keeps the clients' logs as <client>-before.log before their rollback; 0 turns it off |
| SCENARIOS_DIR | lab/scenarios | the committed scenarios a run set plays by id (sky-srv: the deployed tree) |
| REFERENCES_DIR | lab/references | ADR-031's reference traces a parity scenario's assertion reads (sky-srv: the deployed tree) |
| NIGHTLY_SWEEP_UTC | (unset) | the nightly sweep's start, HH:MM UTC; unset means no nightly |
| NIGHTLY_QUIET_S | 1800 | the lab must have been idle this long before the nightly starts |
| NIGHTLY_WINDOW_S | 5400 | the nightly starts within this long after its minute, or not that day (a restart after the window never runs it) |
| HEARTBEAT_FRESH_S | 120 | the nightly needs every managed client's poll this recent (its game up) |
| LABAPI_VERSION | dev | the commit the image was built from (CI's build arg), shown by GET /status as `version` |
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
`request-screenshot` it is `{"png_b64": "..."}`; for `inventory` it is `{"ref":
<form id>, "items": {"<decimal form id>": <count>}}`, or `{"error": "no such
ref"}` from a game without that reference; for `transfer` it is `{"item": <form
id>, "to": <form id>, "count": <n>, "player": {"before": <n>, "after": <n>},
"container": {"before": <n>, "after": <n>}}` (`"from"` for a take), and a
refusal is `{"ok": false, "error": "Error: ..."}`, a failed step.
