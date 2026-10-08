# lab-api and the lab gamemode: the RPC contract

lab-api reads server state and issues the two server-side scenario verbs
through the HTTP RPC hook skymp5-server already has on its UI port (3000 by
default, main port + 1 otherwise; `skymp5-server/ts/ui.ts`): `POST
/rpc/<name>` with a JSON body `{"payload": <anything>}`, handled by the
gamemode's `mp.onHttpRpcRunAttempt(name, payload)`, whose return value is the
response body. No C++ change. The lab gamemode script (Track S2) implements
the two names below; lab-api consumes nothing else from the server.

`SERVER_STATE_URL` is the UI base, for example `http://10.10.70.10:3000`; the
scheme comes from the URL (the ports doc says HTTPS, the code looked like plain
HTTP; lab-api accepts either and does not verify certificates).

## Client identity

Scenario clients (`c1`, `c2`) are profileIds. The server runs with
`offlineMode: true`, so each lab client logs in with the `profileId` its
machine's skymp5-settings.txt names, and the gamemode keys actors by it
(`mp.getActorsByProfileId`). The mapping lives in `guests.yaml`:

```yaml
clients:
  c1: {profile_id: 1}
  c2: {profile_id: 2}
```

## labState

Request: `POST {SERVER_STATE_URL}/rpc/labState`

```json
{"payload": {"kind": "actor", "profileId": 1}}
```

Response when the profile has an actor:

```json
{"found": true, "x": 0.0, "y": 0.0, "z": 0.0, "cell": "lab-spawn",
 "isDead": false, "healthPercentage": 1.0,
 "hasAppearance": true, "raceId": 79683, "sex": 0,
 "appearanceAttempts": 1, "lastAppearanceRaceId": 79683,
 "lastAppearanceAllowed": true, "headParts": [333061, 333359, 333361]}
```

`hasAppearance`, `raceId` (the race's form id from the actor's appearance),
and `sex` (0 male, 1 female, from the appearance's `isFemale`) are `false`
or `null` for an actor without an appearance. lab-driver reports the same
`raceId` and `sex` for actors a client sees, so the two sides compare
directly. `appearanceAttempts` counts the client's race menu results
(UpdateAppearance) the server has judged since it started, through the
gamemode event onUpdateAppearanceAttempt; `lastAppearanceRaceId` and
`lastAppearanceAllowed` are the last one's race and the server's verdict
(`null` before the first). `headParts` is the appearance's head part form
ids, sorted (`null` without an appearance); where RaceMenu is present the
server derives them from the look (thuum ADR-026), and lab-api compares them
with a client's head-parts step as `server.actor(c).headParts ==
c.head_parts()`.

`cell` is the server's descriptor for the actor's cell or worldspace,
`FormDesc::ToString`, that is `"<hex id>:<file>"` such as `"3c:Skyrim.esm"`;
`x`, `y`, `z` are absolute engine coordinates. lab-api translates both
through the `cells` table in `guests.yaml`: a known descriptor becomes the
cell's name and the coordinates become offsets from its origin, so a scenario
says `cell: lab-spawn, x: 300`. Without an actor: `{"found": false}`.

```json
{"payload": {"kind": "inventory", "profileId": 1}}
```

Response: `{"found": true, "entries": [{"baseId": 77495, "count": 1}]}` or
`{"found": false}`. `baseId` is the item's base form id as an integer.
lab-api resolves a scenario's `"Skyrim.esm:IronSword"` to a base id through
the hand-maintained `items` table in `guests.yaml`; a plain integer or
`0x`-hex form id in a scenario needs no table entry.


### online

Request: `POST {SERVER_STATE_URL}/rpc/labState` with
`{"payload": {"kind": "online"}}`. Answer: `{"players": [{"actorId": <int>,
"profileId": <int>}, ...]}`, the players logged in right now. lab-api's
`connect` and `reconnect` steps hold until the client's profile appears here
(the server owns that state; a restart empties the list, so presence after
one is a fresh login), up to `connect_timeout_s` (120 s: one relaunch by the
logon launcher or one reconnect after a server restart must fit). Online is not yet
movable: the client refuses MoveRefrToPosition until its generated save has
loaded and fifty Papyrus updates have passed (Skyrim Platform's LoadGame
sink), about eight seconds after online on sky-c1 (measured 2026-10-01), so a
teleport sent in that window is dropped on the client and the server's record
snaps back to the client's real position within three seconds (run
20261001-222803). The `teleport` step therefore judges itself by the record
(below) instead of waiting a fixed time; `connect_settle_s` (0 s) is an
optional extra pause after online.

### time

Request: `POST {SERVER_STATE_URL}/rpc/labState` with
`{"payload": {"kind": "time"}}`. Answer: `{"found": true, "year": <int>,
"month": <int, from 0>, "day": <int, from 1>, "hour": <float>, "daysPassed":
<float>, "timeScale": <float>}`, the server's game clock at the moment it
answers (docs/verbs/time.md; `mp.get(0, "gameTime")`), or `{"found": false,
"error": ...}` from a server without the clock. Scenarios read it as
`server.time().hour` and so on, evaluated when the assert runs.

## labCommand

The server-side scenario verbs (rung R0) go here rather than to the client;
a scenario writes them as client steps (`c1: give {...}`) and lab-api routes
them by name.

```json
{"payload": {"kind": "teleport", "profileId": 1, "cell": "3c:Skyrim.esm", "x": 133857, "y": -61130, "z": 14662}}
{"payload": {"kind": "give", "profileId": 1, "item": "Skyrim.esm:IronSword", "baseId": 77495, "count": 1}}
{"payload": {"kind": "set-appearance", "profileId": 1, "preset": "lab-nord-1"}}
{"payload": {"kind": "open-race-menu", "profileId": 1}}
{"payload": {"kind": "set-percentages", "profileId": 1, "health": 0.5, "magicka": 0.25, "stamina": 0.75}}
{"payload": {"kind": "kill", "profileId": 1}}
{"payload": {"kind": "respawn", "profileId": 1}}
{"payload": {"kind": "papyrus-av", "profileId": 1, "how": "set", "name": "Archery", "value": 45}}
{"payload": {"kind": "staff-rank", "profileId": 2, "rank": 0}}
```

`teleport` carries the descriptor and absolute coordinates; lab-api resolves
a scenario's named cell and offsets before sending (a descriptor the table
does not know passes through unchanged). The server answers ok as soon as
the record is set, which proves nothing about the client, and the written
record stands until the client's next movement report (an idle client can
take longer than a few seconds), so lab-api waits `teleport_settle_s` (3 s),
asks the client for a dump-state and reads the actor back: the client's own
position and the server's record must both sit within `teleport_tolerance`
(64 units) of the target in x and y (z is the terrain's), or the teleport is
sent again until `teleport_timeout_s` (60 s) is spent. The step's note says
how many attempts it took, and a step that never lands is red
(E_RUN_TELEPORT) with the last client report and server record named. `set-appearance` applies `presets/<preset>.json` next to the gamemode (an
appearance record as `mp.get(actor, "appearance")` returns it; recorded from
a real client, never typed). `open-race-menu` opens the server's race menu
for the actor (`mp.setRaceMenuOpen`): the client is told to show the menu,
and the server takes one UpdateAppearance from it. `set-percentages` sets the given actor values as
fractions. `kill` sets the actor dead; `respawn` clears it and moves the actor
to its spawn point. `papyrus-av` runs an actor value native on the player's
actor through the server's own Papyrus VM (`mp.callPapyrusFunction`, the
path a script takes; docs/verbs/actor-values.md): `how` is get, base or max
(answers `value`) or set, mod or force (answers the `base` and `current`
the server then reads back). `staff-rank` sets the player's staff rank, the
server's property `staffRank` (0 player, 1 moderator, 2 admin, 3 owner;
docs/verbs/console-commands.md), which the server's console table reads
when the server's `enableConsoleCommandsForAll` is off.

Response: `{"ok": true}` or `{"ok": false, "error": "<reason>"}`. For `give`,
lab-api adds `baseId` next to the scenario's `item` string so the gamemode
need not resolve names.

## What the gamemode may assume

- Calls are serialized by lab-api (one run at a time) and rare (per assert
  block, per server verb); nothing here is a hot path.
- An unknown `kind` answers `{"found": false, "error": ...}` or `{"ok":
  false, "error": ...}`; lab-api treats both as data errors, not crashes.
- The test fake `labapi.fakes.FakeState` speaks exactly this contract; a
  change here changes the fake and this file in the same commit.
