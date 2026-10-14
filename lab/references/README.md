# lab/references

ADR-031's reference traces: what the engine alone plays for an action, recorded
in a solo run (a scenario with `solo: true`: the game without skymp5-client, the
driver's `solo-start` loading the template save, `place-npc`, the action,
`watch-start` and `watch-stop`; the run's `trace-<client>.json` artifact is the
recorder's output). Two files per action:

- `<action>-a.json`: the player acting on the placed NPC;
- `<action>-b.json`: the NPC acting on the player;

each `{"at": <ms of the action in that trace>, "npc": <the NPC's form id,
optional>, "trace": <the watch-stop result>}`. A parity scenario
(`lab/scenarios/p-<action>.yaml`, its `parity:` block) compares a multiplayer
run's four views with them; `parity.findings`, `parity.ok` and `parity.report`
are the assertions. A reference is committed alone and reviewed like a scenario
(the CI gate covers this directory); it is engine behavior, so it is retaken
only when the game or the mod layer changes, never for a verb.
