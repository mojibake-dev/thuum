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
 "hasAppearance": true, "raceId": 79683, "sex": 0}
```

`hasAppearance`, `raceId` (the race's form id from the actor's appearance),
and `sex` (0 male, 1 female, from the appearance's `isFemale`) are `false`
or `null` for an actor without an appearance. lab-driver reports the same
`raceId` and `sex` for actors a client sees, so the two sides compare
directly.

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

## labCommand

The server-side scenario verbs (rung R0) go here rather than to the client;
a scenario writes them as client steps (`c1: give {...}`) and lab-api routes
them by name.

```json
{"payload": {"kind": "teleport", "profileId": 1, "cell": "3c:Skyrim.esm", "x": 133857, "y": -61130, "z": 14662}}
{"payload": {"kind": "give", "profileId": 1, "item": "Skyrim.esm:IronSword", "baseId": 77495, "count": 1}}
{"payload": {"kind": "set-appearance", "profileId": 1, "preset": "lab-nord-1"}}
{"payload": {"kind": "set-percentages", "profileId": 1, "health": 0.5, "magicka": 0.25, "stamina": 0.75}}
{"payload": {"kind": "kill", "profileId": 1}}
{"payload": {"kind": "respawn", "profileId": 1}}
```

`teleport` carries the descriptor and absolute coordinates; lab-api resolves
a scenario's named cell and offsets before sending (a descriptor the table
does not know passes through unchanged). `set-appearance` applies `presets/<preset>.json` next to the gamemode (an
appearance record as `mp.get(actor, "appearance")` returns it; recorded from
a real client, never typed). `set-percentages` sets the given actor values as
fractions. `kill` sets the actor dead; `respawn` clears it and moves the actor
to its spawn point.

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
