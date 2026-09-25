# lab-driver

The Skyrim Platform plugin that runs lab steps inside a lab client (docs/LAB.md).
It polls lab-api on every tick (the heartbeat), executes the step on the next
update (where Papyrus calls are legal), and posts the result. It never touches
mpClientPlugin, so it coexists with skymp5-client.

Build (any machine with node): `npm install && npm run build`, output
`build/lab-driver.js`. Install: copy `build/lab-driver.js` and a
`lab-driver-settings.txt` (from `lab-driver-settings.example.txt`) into
`Data/Platform/Plugins/` before launching the game; SP reloads every plugin
when that folder changes, so do not drop it in mid-session.

Types come from the fork's own `skyrimPlatform.ts` (tsconfig paths), so the
API this compiles against is the one the client ships.

Actions: dump-state, teleport, move (UNCONFIRMED), equip, cast, activate,
screenshot (UNCONFIRMED). Each UNCONFIRMED tag is cleared by a lab run, not
by reading code (CLAUDE.md rule 2).
