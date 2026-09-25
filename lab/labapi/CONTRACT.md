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
 "isDead": false, "healthPercentage": 1.0}
```

`cell` is the gamemode's string for the actor's cell or worldspace (the
editor id where one exists, the hex form id otherwise); assertions compare it
to the scenario's literal. Without an actor: `{"found": false}`.

```json
{"payload": {"kind": "inventory", "profileId": 1}}
```

Response: `{"found": true, "entries": [{"baseId": 77495, "count": 1}]}` or
`{"found": false}`. `baseId` is the item's base form id as an integer.
lab-api resolves a scenario's `"Skyrim.esm:IronSword"` to a base id through
the hand-maintained `items` table in `guests.yaml`; a plain integer or
`0x`-hex form id in a scenario needs no table entry.

## labCommand

The scenario verbs `teleport` and `give` are server-side (rung R0): lab-api
sends them here rather than to the client.

```json
{"payload": {"kind": "teleport", "profileId": 1, "cell": "lab-spawn", "x": 0, "y": 0, "z": 0}}
{"payload": {"kind": "give", "profileId": 1, "item": "Skyrim.esm:IronSword", "baseId": 77495, "count": 1}}
```

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
