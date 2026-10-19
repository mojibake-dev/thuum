# A friend joins a playtest from their own PC (research, 2026-10-19)

Eli's ask, verbatim (2026-10-19): "what will deployment look like? do we have
like,,, user UI to make characters and log in? we're almost at a point where
ill need a friend to do a playtest. do we have a script for them to deploy?"
And: can it reuse the shape of the estate's other game deployment,
vvardenfell (the Morrowind TES3MP server, its mod pipeline and its Discord
posts)? Three more, the same day: "regarding discord, the existing bot and
channel is perfect"; "for mod dissemination- we're doing vortex profiles,
yeah? is there a way to do one download script slotted with a nexus API key
that then sets up the profile?"; and "the character creation from earlier
testing, i noticed that the player starts with a helmet. this i do not want.
we want no helmet and to be able to see ones face. im honestly considering
having players start in the 'alternate start' mod".

**When.** Eli, through the main session: "the friend will be needed probably
half way through m3." M3 is hosting (docs/PLAN.md "M3: Hosting", 8 to 16
weeks; ADR-035: a cell's own NPCs hosted by one player's game per cell). So
the target is mid-M3, not this week. The plan in section 3 orders the items
by lead time: identity and login, the server-side load-order enforcement,
network exposure and the client bundle's installer start during M3's first
half, because each waits on a decision, on the estate (core) or on a Windows
build; the items that depend on M3's own state (a friend hosting a cell, the
handoff when a friend drops) come after M3's first verbs land.

**Sources.** This repo at 48f1815 (main, 2026-10-19) and the branch
apocrypha/layer-essentials at 5ee3c8f; the fork as checked out on the Mac at
11c126b9 (2026-10-13; the superproject pins d5b05e89, so a line number in the
fork is that checkout's and may have moved), read by this session and by two
read-only agents (login and character creation; the load-order check, the
dist artifact and the ports); the vvardenfell facts
from two peer sessions, cited as "apocrypha, 2026-10-19, from kalpa master
0dbf8ae and baar-dau b6d2171" and "core, 2026-10-19"; the Nexus Mods API
definition, its acceptable-use policy, the Vortex command-line page and the
Collections extension's types, fetched 2026-10-19 (URLs inline). Nothing
here was run; every fact is a read, and an inference is tagged HYPOTHESIS.
No credential appears in this file.

## 1. What exists today

### 1.1 A player's client: what a lab clone runs

The lab has never installed a client anywhere but on its own Windows clones,
and it does so with lab tooling around an upstream build. The pieces:

- **The settings file.** lab/deploy/sky-client/skymp5-client-settings.txt is
  the whole configuration: `server-ip` 10.10.70.10, `server-port` 7777,
  `gameData.profileId` 1, `server-info-ignore` true (lines 1-6). It is
  copied into every game folder's `Data\Platform\Plugins`
  (lab/deploy/sky-client/install-lab.ps1:62, 75-77), which is where Skyrim
  Platform reads `*-settings.txt` from (skyrim-platform/src/platform_se/
  skyrim_platform/Settings.h:177-181: `Data/Platform/Plugins;Data/Platform/PluginsDev`).
  A clone's identity is the pair (lab-driver's `client` name,
  skymp5-client's `profileId`), kept across a relay by reading it back out
  of Plugins before the dist is laid (install-lab.ps1:38-58) and set with
  identity.ps1 (`just client-identity <vmid> <client> <profile>`,
  lab/deploy/sky-client/identity.ps1:1-25). The second file,
  lab-driver-settings.txt (labApiBase http://10.10.70.10, client c1), is the
  lab's automation and nothing a player needs.
- **The client dist.** `just build-client` downloads the `dist` artifact of
  the mirror's `parity-windows.yml` GitHub workflow for branch `parity`, by
  sha when one is given (justfile:52-66). The workflow is the fork's copy of
  upstream's Windows job "pointed at parity so `just build-client` ... has a
  `dist` artifact to download" (skymp/.github/workflows/parity-windows.yml:1-5,
  17-20). The artifact is the whole of `build/dist`: `client/`, `server/`
  and `papyrus-vm/` (.github/actions/pr_base/action.yml:363-366); the
  commit it was built from is inside it,
  `client/Data/Platform/Distribution/build-metadata-public.json`
  (action.yml:330-354; the Mac's copy says 05192845, 2026-10-14). The client
  half is Skyrim Platform (`Data/SKSE/Plugins/SkyrimPlatform.dll`, its
  runtime under `Data/Platform/Distribution/RuntimeDependencies`, the
  TESModPlatform script, `Data/Platform/Modules/skyrimPlatform.ts`), the
  Rust wire client `Data/SKSE/Plugins/MpClientPlugin.dll`, and
  `Data/Platform/Plugins/skymp5-client.js`
  (skyrim-platform/tools/dev_service/index.js:171-225;
  skymp5-server/cpp/CMakeLists.txt:15-19); CI fails the build on any file
  missing or extra against unit/DistContentsExpected.json
  (unit/DistContentsTest.cpp:165-179). It also carries a generated
  `skymp5-client-settings.txt` with offline defaults (`server-ip`
  127.0.0.1, port 7777, `profileId` 1, `master` "", `server-master-key`
  null; cmake/scripts/generate_client_settings.cmake:6-23); no settings
  template is checked in. Skyrim Platform is 2.9.0
  (skyrim-platform/package.json:3) and the client requires exactly that,
  quitting to the main menu otherwise (skymp5-client/src/version.ts:3;
  services/services/spVersionCheckService.ts:13-25). lab/tools/stage-client.sh
  zips the `client/` tree and ships it inside VLAN 70 through a throwaway
  `python3 -m http.server` on sky-srv, hash-checked in the guest
  (stage-client.sh:35-63); lab/tools/client-dist.sh lays it into every game
  folder with install-lab.ps1 and checks that `SkyrimPlatformImpl.dll` in
  each folder is the dist's (client-dist.sh:9-25). The fork's own GitLab
  pipeline has a `client-build` job for a Windows runner on sky-build (VM
  720), off until `CLIENT_BUILD_WINDOWS` is set, whose `dist` carries no
  build metadata (skymp/.gitlab-ci.yml:140-191); today the build is GitHub's.
  Upstream's only player-facing install text is
  skymp/docs/docs_client_installation.md: copy `build/dist/client` into the
  Skyrim SE folder, SKSE required, no launcher. The word "launcher" occurs
  once in the fork (docs/docs_server_configuration_reference.md:84, the
  player limit "Visible in launcher and on skymp.io"); the installer that
  writes the settings file is a separate upstream repository,
  skymp5-installer (skymp/CMakeLists.txt:101; the deploy workflows name
  skymp5-installer-v2), whose code is not in the fork. HYPOTHESIS: it is
  upstream's server-listing launcher; nothing here says more.
- **The script-extender layer.** SKSE 2.2.6 (Nexus mod 30379 file 462377)
  and the Address Library's `versionlib-*.bin`, pulled off fenestrate by
  lab/tools/pull-layer.sh into gitignored caches, staged as
  `C:\sky-lab\skse-1.6.1170` and `C:\sky-lab\addrlib` (stage-client.sh:64-80)
  and laid by install-layer.ps1 (lab/deploy/sky-client/install-layer.ps1:1-49).
- **The game.** Skyrim SE 1.6.1170, built on each clone from Steam's three
  depots for that build (489831, 489832, 489833), kept in persist under
  game/1.6.1170 and served inside the VLAN (lab/deploy/sky-client/add-game.ps1:1-19;
  ADR-022), into a "Stock Game" folder outside Steam's,
  `C:\Games\Skyrim Special Edition 1.6.1170`, started through the SKSE
  loader with Steam running offline (lab/deploy/sky-client/README.md:148-169,
  188-204). ADR-025: players run 1.6.1170 because RaceMenu does not load on
  1.7.104, and "a player who installs today gets 1.7.104 from Steam and
  downgrades once with Steam's depots" (docs/DECISIONS.md, ADR-025 Decision);
  the same ADR promises "a player-facing install guide (the downgrade, the
  Stock Game folder, SKSE 2.2.6, the Address Library for 1.6.1170)" with the
  public server. That guide does not exist yet.
- **The mod layer.** `just persist-mods` (lab/tools/persist-mods.sh) rebuilds
  persist's `mods/` from its sources each run: one folder per mod in Data
  layout, `SHA256SUMS` ("<hash>  <mod>/<path>"), `plugins.txt` in load
  order, and the plugins again in each game version's `esm/` directory where
  the server loads them (persist-mods.sh:78-86). Its sources are Nexus
  archives fetched with the Keychain's key and md5-checked, plus Eli's
  rotfern from ~/Code/mods/rotfern-skyrim (persist-mods.sh:6-71). The layer
  on main today: RaceCompatibility 2.16, rotfern, RaceMenu 0.4.20.0 (1.6.1170
  only), CBBE 2.0.3 (client-only plugins), Lost Grimoire 1.6, Apocalypse
  10.2.3, Headshot Kills 1.2 with Core Impact Framework 2.0.7, AI Pathing
  Freeze Fix 1.1 (docs/MODS.md:40-86; the `plugins=(...)` array at
  persist-mods.sh:139). A clone installs it with `just client-mods <vmid>`:
  add-mods.ps1 fetches every file SHA256SUMS lists from an HTTP base, keeps a
  file already in place with the right hash, scopes a folder named
  `<mod>@<version>` to that game version, and enables the plugins in the lab
  user's plugins.txt (lab/deploy/sky-client/add-mods.ps1:1-64).
- **The essentials layer** (branch apocrypha/layer-essentials, docs/MODS.md
  "The essentials layer (Eli's set, staged 2026-10-19)"): 99 mods copied from
  Fenestrate's Vortex staging folders plus 5 from Nexus, on top of the eight
  above; 94 plugins in the clients' order, 80 served by the server and 14
  client-only, 49 light; 29 folders scoped `@1.6.1170` (every SKSE DLL mod);
  113 folders, about 6,200 files, 4.5 GB. Its tables are the thing to notice
  for deployment: `lab/layer/essentials.tsv` (one row per mod folder: source,
  ref, a tree hash or an archive md5, the installer folders taken, plugins;
  every row's note carries the Nexus mod id, file id and archive md5) and
  `lab/layer/load-order.tsv` (order, plugin, mod, light flag, versions,
  served or client-only, why), rendered by lab/tools/layer-render.py into
  persist-mods.sh's array and both server-settings files, with a test that
  fails when the three disagree (layer-render.py:1-12 on that branch).
- **A clone's bring-up** is `just client-bringup <vmid> <sunshine base>
  [client] [profile]` (justfile:493-505): Sunshine port and identity, the
  NVIDIA driver, the display, the game firewall, Steam offline, speakers,
  crash dumps, OneDrive off, the dist, the identity, a launch test. Of these
  only the dist and the identity are a player's; the rest is a headless VM in
  a dark VLAN (lab/deploy/sky-client/README.md:92-146 on the firewall and
  the WinHTTP proxy, 188-204 on Steam offline).

**What is licensed and may not be redistributed, versus what we may ship.**

- The game and its masters never enter a repo or an image except through
  rpool/sky/persist: persist-game.sh streams them from fenestrate as bytes
  ("nothing licensed is staged on local disk or enters the repo",
  lab/tools/persist-game.sh:1-5); Steam's rule is one licensed copy per
  person playing at once (docs/LAB.md "Licensing", lines 228-234). A friend
  brings their own Skyrim SE.
- Third-party mods "never enter a repo or a lab image except through
  rpool/sky/persist, like the master files (Nexus terms)" (docs/MODS.md:36-38).
  The plan's distribution track says why: "third-party mods ship as a Nexus
  collection installed by Vortex, because Nexus terms do not allow
  redistributing other authors' mods and collections are the sanctioned
  form" (docs/PLAN.md "Cross-cutting tracks", Distribution). rotfern is Eli's
  own and "personal use only (its README): persist and the lab, never a repo"
  (persist-mods.sh:16-18). Section 2.1 has what Nexus's own documents say.
- Our own work may ship and must: ADR-014, "nothing we build is private";
  the fork is AGPLv3 (server) and GPLv3 (client, Skyrim Platform), the
  skymp-wire crates MIT, and the gamemode "should be treated as distributed"
  (docs/DECISIONS.md ADR-014). So the client dist, the wire cdylib, the
  gamemode's client scripts, the settings template and an installer are ours
  to hand a friend. SKSE's and the Address Library's own redistribution terms
  are not recorded anywhere in this repo: an open check (section 2, G1).

### 1.2 Login and characters today

**Upstream's online flow** (the fork's code, read at 11c126b9):

- The client decides the mode from the settings file: offline when
  `gameData.profileId` is an integer, in which case it emits `authAttempt`
  with `{ local: { profileId } }` at once and no login dialog is shown
  (skymp5-client/src/services/services/authService.ts:132-135, 612-623).
  Otherwise it drives an in-game browser login (the skymp5-front React UI,
  strings "log in via Discord", "join the Discord server",
  authService.ts:71-80): a Discord OAuth round trip through the master API
  (`${masterUrl}/api/users/login-discord?state=...`, line 275; the status
  poll at 355-356), then a play session for this server
  (`/api/users/me/play/${masterKey}`, 317-328), and a hardcoded invite to
  upstream's Discord (line 310). The master URL defaults to
  `https://gateway.skymp.net` when the settings name none, an empty string
  included (services/settingsService.ts:40); the master key defaults to
  `server-ip:server-port` (settingsService.ts:28-36); `server-info-ignore`
  skips the `/api/servers/<key>/serverinfo` fetch (settingsService.ts:77-78).
  The login packet carries only `gameData.profileId` (offline) or
  `gameData.session` (online) and nothing about the client's files
  (authService.ts:616-647). The login dialog is a Skyrim Platform browser
  widget captioned "Authorization" with a "log in via skymp" button and a
  "Play" button (authService.ts:522-588), drawn by skymp5-front, the
  in-game browser UI that Skyrim Platform loads from
  `file:///Data/Platform/UI/index.html` (skyrim-platform/src/tilted/ui/
  MyChromiumApp.cpp:152); `BUILD_FRONT` is OFF by default and in the fork's
  CI (skymp/CMakeLists.txt:97; .gitlab-ci.yml:175), so HYPOTHESIS: our dist
  cannot show the online dialog at all, which offline mode never needs. The
  email and password forms in skymp5-front are dead code (LoginForm.js:28-33
  only writes localStorage; features/login/index.js is never imported), and
  "travel to skyrim" is that dead form's button text (locales/en.json:5):
  only the Discord button and Play are live. One more thing a friend would
  meet: a connection refused for a wrong password shows upstream's "Update"
  form, whose button opens https://skymp.net/UpdInstall
  (authService.ts:590-605, 303-305).
- The server's Login system takes the two paths: online, it asks the master
  `${masterUrl}/api/servers/${masterKey}/sessions/${session}` for the
  profile (skymp5-server/ts/systems/login.ts:53), checks Discord guild
  membership, roles and bans through a bot token (144-196), posts "Server
  Login: Server Slot ..., IP ..., Actor ID ..., Master API ..., Discord ID
  ..." to a Discord channel (243-268), and emits `spawnAllowed`; offline, a
  numeric `gameData.profileId` goes straight to `spawnAllowed`
  (login.ts:90-101, 233-237). The settings keys are `master`, `masterKey`,
  `offlineMode`, `discordAuth` {botToken, guilds[{guildId,
  eventLogChannelId}]} (ts/settings.ts:8-37). The master listing
  (systems/masterClient.ts:36-39) and the Discord ban system
  (systems/discordBanSystem.ts:18-19) are off in offline mode. The code
  carries its own verdict: "TODO: reimplement Login system. Preferably, in
  C++ with clear data flow" (login.ts:24).
- Spawn: `getActorsByProfileId(userProfileId)[0]`, and `createActor(0,
  startPoints[idx].pos, angleZ, worldOrCell, userProfileId)` plus
  `setRaceMenuOpen(actorId, true)` when the profile has none
  (systems/spawn.ts:17-37); the server keys actors by profile id
  (skymp5-server/cpp/server_guest_lib/WorldState.h:227, 252;
  MpObjectReference::RegisterProfileId, MpObjectReference.cpp:911) and
  persists it on the change form (MpChangeForms.cpp:40, 310). A new actor
  has no appearance and its name falls back to "Prisoner"
  (PartOne.cpp:383-387, 890-893); the client loads Skyrim Platform's
  template save for it (assets/template.ess, LoadGameApi.cpp:170-174;
  HYPOTHESIS from comments at LoadGameApi.cpp:33-35: the race shown is
  Nord). Two facts for the identity decision: the profile index holds ids
  above 0 only (MpObjectReference.cpp:933-935), so profileId 0 gets a new
  actor on every login; and there is no duplicate-login or ownership check
  on a profileId anywhere on the offline path (login.ts:233-237;
  spawn.ts:17-51): whoever sends the id plays the character. After a
  restart, saved players load disabled (PartOne.cpp:434-438) and an actor
  without an appearance has its race menu forced open again
  (MpActor.cpp:778-782).

**The lab's flow** is the offline path with hand-assigned ids: the server
runs `offlineMode: true` with `master: ""` (lab/deploy/sky-srv/server-settings.json:5-6),
"any profile id may connect" (docs/LAB.md:697), each clone logs in as the
profileId its settings file names (c1 is 1, c2 is 2:
lab/labapi/labapi/guests.yaml:34-39; lab/labapi/CONTRACT.md "Client
identity"), and the gamemode keys everything by it. There is no password:
the server reads `password` from server-settings.json and binds with none
when the key is absent (skymp5-server/cpp/addon/ScampServer.cpp:361-369),
and the lab's settings have no such key.

**The wire's authentication**, as built: netcode connect tokens. "The lab
runs `Unsecure`. A public server runs `Secure` with a private key held by the
server process and a tiny issuer endpoint (`wire-transport::token`):
password or invite in, signed token out, over HTTPS terminated by the
operator's proxy" (docs/WIRE.md:136-141; ADR-011). In the code:

- The server binds with unsecure tokens unconditionally today, "Lab
  authentication (unsecure netcode tokens) is the only kind before the token
  issuer exists; the password gate still applies"
  (skymp-wire/crates/wire-bridge/src/lib.rs:69-73, `Auth::Unsecure` passed
  at 156; skymp5-server/cpp/addon/WireServer.cpp:31-33 logs "netcode,
  unsecure tokens"). `Auth::Unsecure` "exists for the lab and for nothing
  else" (wire-transport/src/token.rs:1-12). In unsecure mode netcode's
  server key is all zeros, so any client mints a valid token for itself
  (renetcode 2.0.0 server.rs:125-128 in the cargo registry; our
  wire-client-ffi/src/client.rs:93-107). HYPOTHESIS: the password riding
  in that token's user data is readable by anyone who captures the
  handshake; it keeps strangers off a port only until one bothers.
- The password gate exists on both ends: the client reads
  `Data/Platform/Distribution/password` ("The password file SkyMP's installer
  writes", wire-client-ffi/src/lib.rs:37-38, 56-60, 103-110) and carries it
  in the token's user data (token.rs:57-66); the server disconnects a wrong
  one with reason 303, `E_TX_PASSWORD` (wire-transport/src/lib.rs:336-344;
  wire-bridge lib.rs:414, a unit test). The client always connects with an
  empty token today (client.rs:156).
- The issuer is a signing function waiting for a front: `token::issue`
  signs "after the operator's own check (password, invite, allowlist) has
  passed. The HTTPS front for this lives in the gamemode, not here"
  (token.rs:30-32). No gamemode has that front. The handshake's only
  version gate is netcode's protocol id, "SKYMPW" plus the schema version
  (wire-transport/src/lib.rs:186-191; `SCHEMA_VERSION` 13 at
  wire-schema/src/lib.rs:35): it gates the wire build, not the plugins.
- The Session family's `Hello` is defined (schema_version, `client_build`
  "compared against the server's allowlist", `mod_hashes` "Hash per mod in
  load order; the server compares against its own", `name`;
  wire-schema/src/lib.rs:156-171) and validated for its schema version only
  (wire-validate/src/lib.rs:471-476). It is an M0 message, "reserved until
  its verbs land" (wire-schema lib.rs:6-7): it has no JSON form (wire-json
  lib.rs:17), the bridge turns an M0 message into a rejection (wire-bridge
  lib.rs:217-218), and the only `Hello` ever built is in the validator's
  tests (wire-validate lib.rs:604-607). The load-order hash the plan calls
  "the server-side half of the same idea" (docs/PLAN.md Distribution) is a
  field with no sender and no receiver.

**Characters.** SkyMP's own path is the character UI, and the fork kept it:

- A fresh actor gets the race menu from the server (spawn.ts:36,
  `setRaceMenuOpen`), and "the server's record and its open race menu
  (isRaceMenuOpen in CreateActor) bring the menu back" after a refused
  result (docs/verbs/character-creation.md "Observe, impose, suppress").
  The engine's RaceSex menu listed exactly the ten playable races on the
  lab's vanilla files (character-creation.md "Engine surface", run
  20261003-074358); the race must be Playable or the one the server already
  gave (R1, same doc, "Authority").
- The appearance is recorded once per menu session (R0,
  docs/verbs/appearance.md "Authority"; UpdateAppearance MsgType 4,
  SetRaceMenuOpen 29). With RaceMenu present, the look is the record and
  the appearance is derived from it on the server (ADR-026); the look
  travels as RaceMenuPreset both ways, bounded (docs/verbs/racemenu-sync.md
  "Message contract", "Authority": R2, every form checked against the load
  order). RaceMenu runs on 1.6.1170 only (racemenu-sync.md "Engine
  surface"), which is ADR-025's reason.
- The lab opens a seat's menu from the server (`just playtest-race-menu
  <profile>` posts labCommand `open-race-menu`, justfile:454-455), seeds
  looks from presets (lab/gamemode/presets, Eli's rotfern-*.json gitignored),
  sets a playtest's seats server-side from lab/playtests/<n>.yaml through
  labCommand (`just playtest-setup <n>`, lab/tools/playtest_setup.py:1-13;
  lab/playtests/25.yaml), and keeps worlds between sessions with
  `just playtest-save` and `playtest-restore` (lab/tools/playtest-world.sh:1-16).
  None of that is a player's UI; it is the operator's.
- The starting equipment (the helmet Eli does not want) and the start
  itself are in section 2.2.

**ADRs on accounts and identity.** None by name. A grep of
docs/DECISIONS.md for account, identity, login, profile and Discord finds
ADR-011's token-issuer paragraph ("password or invite to token") and
mentions of "login" as a game moment. The identity model for a friend is
undecided, and section 3 lists it as Eli's first decision.

### 1.3 The server side a friend would reach

- **Where it is.** sky-srv (VM 700, 10.10.70.10) in VLAN 70, "dark by
  default" (docs/LAB.md "Topology"): policy table 105 blackholes the default
  route and every other VLAN, with /32 allows for Pi-hole and fenestrate
  (LAB.md "Egress", 155-175). The server listens on UDP 7777 with its UI and
  RPC port on TCP 3000 (lab/deploy/sky-srv/docker-compose.yml:23-25;
  LAB.md:697-700); lab-api on TCP 80. From outside the VLAN only Caddy's
  vhosts reach anything (`https://thuum.gaussing.tv/lab` and `/results/`,
  LAN and tailnet only, LAB.md "Names and access", 118-126), plus the SSH
  jump through the host. fenestrate (Eli's desktop, VLAN 60) has an allow to
  sky-srv's three ports (topology, "fen -- udp 7777, tcp 3000, tcp 80 -->
  srv"); nothing else does. Nothing is reachable from the internet.
- **core's reading** (core, 2026-10-19): sky-srv "lives in the dark sky
  VLAN (zone sky, egress dark, no inbound; Caddy's thuum.gaussing.tv serves
  only /results/ and lab-api; the game ports udp/7777 and tcp/3000 are not
  exposed). Exposing sky-srv would break the lab's isolation contract." The
  estate's shape for an internet-facing game server is the DMZ pattern: an
  own vdmz IP, a dmzgw pf pass for the UDP port (OpenBSD VM 500,
  roles/dmzgw/templates/pf.conf.j2), a `wan_port_forwards` entry, an A record
  at Namecheap, a Pi-hole split-horizon record; and "dmz.tf already carries a
  reserved stub VM 520 'nvmp' for a Windows game server, exactly this
  pattern. So a friend-facing SkyMP server is a DMZ sibling of vvardenfell,
  not sky-srv." vvardenfell itself is VM 510 in the DMZ, UDP 25565 the only
  public port (apocrypha, 2026-10-19).
- **What the server exposes, and with what authentication.** Two
  listeners (skymp5-server/ts/ui.ts has the only `listen` calls in the
  TypeScript; everything else is outbound): the UDP game port (`port`,
  unsigned tokens, the optional password, identity from the master session
  or, offline, whatever profileId the client sends), and the HTTP UI port
  (3000, or `port` + 1; plain HTTP, ui.ts:102, 114, 136-139, although
  docs/docs_server_ports_usage.md:13-20 says HTTPS). On the HTTP port `POST
  /rpc/:name` runs the gamemode's `onHttpRpcRunAttempt` with no
  authentication (ui.ts:52-66), the static `data/` folder is served with no
  authentication except a 403 on scripts, plugins and archives (ui.ts:48-50,
  89), and `/metrics` wants Basic auth (ui.ts:73-86). The lab's labState
  and labCommand hang on that `/rpc` route (lab/gamemode/gamemode.js:332-345,
  "No auth: the UI port is reachable only inside the lab VLAN and from
  lab-api", gamemode.js:20-21); lab-api "has no auth of its own"
  (docs/LAB.md:366-367); the lab settings set `enableConsoleCommandsForAll:
  true` (server-settings.json:30) and no password. All of these are lab
  conveniences that a friend-facing server must not inherit: the UI port
  stays off the internet, and the game port carries at least the password.
- **Load orders in step: what is checked, by whom.** This is the finding
  that changes the plan. The docs say the server compares each client's
  list against its own "name, size and CRC32 per slot" (docs/LAB.md:305-309;
  docs/verbs/light-plugins.md "Authority": "as SkyMP already does for full
  plugins"). The code says the check is the client's, against a list it
  fetches over HTTP from upstream's gateway, and that a mismatch only
  warns:
  - The server writes `data/manifest.json` once at start: for each
    `loadOrder` entry its file name, size, CRC32 (npm crc-32) and a light
    flag, plus an entry for a same-named BSA when `dataDir` holds one
    (skymp5-server/ts/manifestGen.ts:15-27, 44-80; called from
    ts/index.ts:204). The UI port's static handler serves it as
    `GET /manifest.json` (ui.ts:89). No game message carries the list.
  - The client fetches `/api/servers/${masterKey}/manifest.json` from the
    master API (settingsService.ts:150), regardless of `server-info-ignore`,
    which skips only the serverinfo request (settingsService.ts:77-81,
    141-167), five attempts and then an empty list (147-166), and compares
    index by index on name (case-insensitive),
    size and crc32 (services/services/loadOrderVerificationService.ts:136-147),
    sizes and CRCs read through Skyrim Platform's `getFileInfo`
    (skyrim-platform FileInfoApi.cpp:16-23). A client with more full
    plugins than the server shows, in yellow for five seconds, "LOAD ORDER
    WARNING: you have more mods than server!\n(or could not receive server
    mod list)\nCheck console for details." (:128-133); an index that
    differs shows, in red and for good, "LOAD ORDER ERROR!\nCheck console
    for details." (:47, 61-64), or a 30 s variant under
    `ignoreLoadOrderMismatch` (:54-57). Nothing disconnects, quits or
    blocks the login (:50-65). Skyrim Platform's own version check is the
    one that quits (spVersionCheckService.ts:13-25).
  - The server never sees the client's plugins: the login carries only a
    profileId or a session (authService.ts:616-647; login.ts:90-101,
    233-237), and the one place the client lists its own plugins feeds the
    local `loadGame` and nothing else (remoteServer.ts:583-614).
  - HYPOTHESIS, from both agents' reads: the lab's five-second yellow
    warning is the "could not receive server mod list" case, not a
    comparison. The lab client names no `master`, so it asks
    `https://gateway.skymp.net` for `10.10.70.10:7777`'s manifest. Two
    reasons the answer is empty, either sufficient: the lab server is
    offline and never registers there (masterClient.ts:36-39), so the
    gateway cannot know it; and the lab's game firewall blocks SkyrimSE.exe
    outside 10.10.70.0/24 (lab/deploy/sky-client/game-firewall.ps1:29), so
    the request never leaves. The list comes back empty, the loop runs zero
    times, the warning shows and "passes". docs/LAB.md:291-294 ("the check passes because the first
    five match in order") then describes no comparison. To tell: a seat's
    console with `Request/parse error` lines and an empty `Server load
    order:` after them.
  - Consequence: nothing refuses a mismatched client today, and TES3MP's
    byte-identity gate (the one core calls "the real gate") has no analogue
    on this server yet. The materials exist on both ends (the server's
    manifest.json; `Hello.mod_hashes`); the comparison and the refusal are
    a build item (section 3, item 3).
  The server's own load order is kept in step with persist by `just
  deploy-srv`, which refuses a settings file naming a plugin its version's
  esm directory lacks (justfile:259-263), by persist-mods placing the plugins
  there (persist-mods.sh:81-85), and by the layer staging order: persist-mods,
  deploy-srv, the server restarted on the new order, client-mods on both
  clones, snapshots (lab/tools/layer-stage.sh:1-29), gated by the full
  sweep in `just layer-merge`. A layer change moves every plugin's index on
  both ends together.

### 1.4 Release and announcement machinery visible from this repo

- **thuum's pipeline** (.gitlab-ci.yml): `docs-lint` (rule 11, `just
  --list`), `lab-tests`, `labapi-tests`, `labapi-image` pushed to the sky-ci
  registry at 10.10.70.12:5000 on a change under lab/labapi, `driver-build`
  (lab-driver.js as an artifact, 3 months), `scenario-gate`. No release job,
  no artifact a player would download, no Discord.
- **The fork's pipeline** (skymp/.gitlab-ci.yml): the wire jobs, the
  `server-build` image tagged by branch and pushed to the same registry
  (lines 96-138), the dormant Windows `client-build` (140-191). The Windows
  dist that players would run is GitHub's `parity-windows.yml` artifact on
  the mirror (justfile:52-66), named `dist` with no version in the name; the
  sha is inside (section 1.1).
- **Version pins.** justfile: `client_branch := "parity"`, `runtime :=
  "1.6.1170"`; build-client by sha; compose `SERVER_TAG` (parity by default,
  docker-compose.yml:6-10). The verb loop's shape (`just verb-stage`,
  `verb-merge`, `layer-stage`, `layer-merge`, `sweep`; justfile:511-537,
  ADR-030) promotes both clones to a build and the server to its image; the
  record is a dated docs/LOG.md entry written by hand. No manifest ties a
  client build, a mod layer and a server load order together by hash; the
  tie is "the same sha on both clones and the server", kept by the scripts.
- **Discord in this tree:** none. In the fork, upstream's login system posts
  "Server Login" lines to a guild channel through a bot token (login.ts:243-268),
  the ban system watches guild bans (discordBanSystem.ts), and the client
  carries upstream's invite link (authService.ts:310); all three are off or
  irrelevant in offline mode.

**vvardenfell, the estate's Morrowind deployment** (apocrypha, 2026-10-19,
from kalpa master 0dbf8ae and baar-dau b6d2171; core, 2026-10-19). The
shape, as described, because section 3 reuses it:

- Repos: apocrypha's `mods.toml` is the Nexus provenance ledger (nexus_id,
  file_id, md5, bundle_dir, plugins, variants). kalpa
  (gitlab.gaussing.tv/root/kalpa, git-LFS bytes on core under
  /rpool/files/kalpa) holds the mod set under `bundle/`, the load order in
  `openmw.cfg` (155 `content=` lines, `expect_plugins` in canon.toml), the
  roll code in `canon/` (stdlib only), the friend scripts
  `clients/canon-sync.ps1` and `.sh`, and the pipeline. baar-dau
  (github.com/mojibake-dev/baar-dau) is the server-side admin:
  `baardau-apply` and a stdio MCP over ssh.
- Pipeline (kalpa/.gitlab-ci.yml, stages roll, gate, announce, on push to
  master, shell runner tag `kalpa` on CT 150 with the LFS store; core owns
  the runner). roll: `git lfs pull`; `python3 -m canon.cli roll -c
  canon.toml` writes build/{modlock.json, morrowind-canon.zip, tree/,
  openmw.cfg} (the zip also carries INSTALL.md, tes3mp-client-default.cfg,
  requiredDataFiles.json); `canon.cli verify` re-hashes against the modlock;
  publish in-job (about 14 GB) by `rsync -a --delete` over ssh to
  root@10.0.0.10:/rpool/dist/canon/<token>/, modlock.json last as the seam,
  then a read-back of modlock.json whose sha must equal the rolled one.
  Artifacts kept: only modlock.json and modlock.sha256 (one week). gate:
  `when: manual`, `ssh baardau baardau-apply --modlock - < build/modlock.json`
  through a forced-command key via the jump. announce: needs roll and gate,
  `python3 -m canon.cli announce` with a masked bot token. Hard rule: byte
  identity, because TES3MP enforces plugin CRC32s; plugins are never
  re-saved, only byte-edited.
- Artifact: modlock.json (MODLOCK_VERSION 2): engine pin (fork tes3mp,
  openmw_base 0.47, protocol 10); content as ordered plugins with name,
  sha256, crc32, size, masters; archives, groundcover, fallback settings;
  files as every bundle file with path, sha256, crc32, size;
  enforce_checksums. requiredDataFiles.json is derived from content.
  Served at https://canon.gaussing.tv/<stable unlisted token path>/ by Caddy
  on core (`file_server` without browse, so the token path is the gate;
  Cache-Control immutable on tree/, no-cache on modlock.json; one of three
  public vhosts; WAN tcp/443 to the host). Vanilla ESMs are hashed into the
  modlock and never shipped.
- The friend runs canon-sync.ps1 (Windows: built-in curl.exe and
  Get-FileHash) or canon-sync.sh. First time: download the zip, unzip to a
  dedicated folder; the scripts ship inside and sync their own folder. From
  the release post: `powershell -ExecutionPolicy Bypass -File canon-sync.ps1
  -ManifestSha <sha>`. It fetches modlock.json and refuses if its sha256 is
  not the invite's (the one trust check); hashes every local file; downloads
  only missing or changed files from tree/, each verified; deletes strays
  not in the manifest (a short keep list); rewrites only the content,
  fallback-archive and groundcover axes of the friend's openmw.cfg and the
  two `data=` lines (the canon folder and the vanilla Data Files found
  through Steam or GOG paths), with a timestamped backup; then self-updates
  both scripts. Updating is re-running with the new sha from the newest
  release post; the server refuses a client whose plugin list, order and
  CRC32s mismatch.
- Address and credentials: vvardenfell.gaussing.tv:25565 UDP (Namecheap A
  record to the home IP, WAN udp/25565 forwarded to the host, DNAT to
  10.10.50.10 through the dmzgw, Pi-hole split-horizon on the LAN, tailnet
  via a policy table); one shared join password baked into the pack's client
  config and "public in Discord by design; no per-player accounts, tokens or
  invites: the invite flow IS access to the Discord channel; the real gate is
  TES3MP's byte-identical requirement" (core). Client requirement: TES3MP
  exactly v0.8.1, English GOTY Morrowind. Server side: `baardau-apply
  --modlock -` writes requiredDataFiles.json under a git transaction, stop,
  commit, start, health-check, restore HEAD~1 and restart on failure,
  refuses a populated server unless `--force`; a non-zero exit blocks the
  announce.
- Discord (canon/discord.py; a bot, Atronoch, not a webhook, so it can pin
  its own post; REST v10 via urllib; one channel id in canon.toml; the token
  in GitLab CI variables and the Mac Keychain, nowhere in IaC). Two posts: a
  pinned setup post, found by scanning the channel's pins for the bot's id,
  created once with both scripts attached and edited in place when its text
  drifts (prerequisites, pack URL, three install steps, play, updating, the
  dedicated-folder warning; sha-free so it stays current); and a release post
  per roll with the per-OS update command and the new manifest sha. Only the
  announce job posts, after the manual gate, "so friends are never told a sha
  the server does not enforce yet". `canon announce --dry-run` previews both.
  Eli, 2026-10-19: "regarding discord, the existing bot and channel is
  perfect." Settled, section 3 item 7.
- core's reuse verdict: reusable nearly as is are the Caddy token-path
  `file_server` pattern (one more handle block, a /rpool/dist/<token>/
  directory, an A record if it needs its own name), kalpa's pipeline shape
  and canon/discord.py (title, server_address, password, base_url,
  channel_id are canon.toml inputs, "so a SkyMP sibling reuses the announce
  module almost verbatim with its own channel"), and a runner lane (sky-ci's
  `sky` and `sky-light` lanes exist). The manifest plus per-file sync model
  "is right for a client mod set but the content model is Morrowind-specific:
  a sibling 'canon' for SkyMP's client build and mods." Not reusable: the
  network (above). Credentials: "nothing generic beyond 'shared secret in
  Discord' plus token-path downloads; SkyMP's own login model is thuum's
  call."

### 1.5 The client's settings keys, for the installer's generated file

Every key skymp5-client reads from `settings["skymp5-client"]` (the agent's
grep over skymp5-client/src; the whole object is printed at startup,
skympClient.ts:19): `gameData` (an integer `profileId` means offline login,
authService.ts:131-132); `server-ip` and `server-port` (the connect target
and the last-resort master key, settingsService.ts:34, 67-68); `master`
(settingsService.ts:40); `server-master-key` and `master-key`
(settingsService.ts:29-31); `server-public-keys` (verifies server-sent JS,
settingsService.ts:69); `server-info-ignore` (settingsService.ts:77);
`ignoreLoadOrderMismatch` (loadOrderVerificationService.ts:52); the fork's
own `raceMenuSync` (raceMenuService.ts:396), `arrowSync`
(arrowSyncService.ts:24) and `magicEffects` (magicEffectsService.ts:44),
each `false` to disable; and the developer knobs `show-me`, `show-clones`,
`skipUpdates` (view/worldView.ts:38, 116-127), `show-net-info`
(netInfoService.ts:112), `animDebug`, `enableProfiling`,
`profilingDurationMs`, `enable-front-hotreload`,
`disable-gamemode-updates`, `blockedEventSources`,
`sweetTaffyPlayerCombatService`. A friend's file needs the first three
groups only: `server-ip`, `server-port`, `gameData.profileId`, and either
`server-info-ignore` true or a `master` of our own once the manifest is
served by us (section 3, item 3).

## 2. The gaps

Each is a question or a build item. "Exists" means on main or on a named
branch today.

- **G1. A distributable client bundle and its Windows installer.** Exists:
  the dist as a GitHub artifact with a generated offline settings file, laid
  by a lab script that reads `C:\sky-lab\games\*.txt` (install-lab.ps1) and
  expects SKSE already there. Missing: one download a friend can take, with
  an installer that finds or makes the Stock Game folder, lays SKSE 2.2.6
  and the Address Library, the dist, the mod layer and a generated
  skymp5-client-settings.txt, and never lab-driver, the lab's 10.10.70.10
  addresses, the game firewall or Steam offline. Open check: SKSE's and the
  Address Library's redistribution terms (nothing in this repo records
  them); if they forbid it the installer fetches them from Nexus or
  silverlock.org with the friend's own click. The 1.6.1170 downgrade
  (ADR-025 Consequences) has no guide and no script; a friend's Steam
  console can run the three `download_depot` commands (ADR-022 "Where the
  files come from") but nothing checks the result.
- **G2. Mod set delivery and version pinning in step with the server's load
  order.** Exists: the layer's single-source tables and renderer on
  apocrypha/layer-essentials, persist's SHA256SUMS and plugins.txt, the
  server's own manifest.json with each plugin's size and CRC32, deploy-srv's
  check, layer-stage's order of operations. Missing: a manifest that names,
  by hash, the client build, the mod files, the plugin list with each
  plugin's size and CRC32, and the engine pin together, served where a
  friend can fetch it; a sync script that trusts only the manifest sha the
  friend was given; the gate that makes the server enforce exactly that
  manifest (G3a) and only then announces it. Question for Eli (D2): which
  channel carries third-party mod files to a friend; section 2.1 has the
  facts.
- **G3. Identity and login for a friend.** Exists: offline mode with a
  profileId in the settings file and no login UI; a server password gate the
  installer could write to `Data/Platform/Distribution/password`; a token
  signer with no issuer front; `Hello` with no sender. Missing: a decision
  (D1), then either per-friend settings (profileId and password, the
  vvardenfell posture: a shared secret and no accounts) or the issuer front
  in the gamemode plus the client's token fetch (ADR-011's public-server
  shape). Upstream's master API and Discord OAuth need a master server;
  gateway.skymp.net is upstream's, and running our own is a product in
  itself. Two constraints from the code (section 1.2): per-friend ids must
  be distinct and above 0 (id 0 is never indexed), and nothing checks who
  owns an id, so on the lazy path anyone holding the pack can play any
  friend's character by editing one number; the password is the only gate,
  and with unsecure tokens it is a courtesy one.
- **G3a. The server-side load-order enforcement.** Exists: the server's
  manifest.json; the client's warning-only check against upstream's
  gateway; `Hello.mod_hashes` reserved. Missing: the server comparing a
  client's list against its own and refusing a mismatch with a reason, and
  the client's check pointed at our server's or our token path's manifest
  instead of the gateway. Without it a friend with one plugin off can log
  in and every form id past it disagrees; the sync script catches it before
  launch, the server never does.
- **G4. Character creation UI versus the lab's profile model.** Exists: the
  server opens the race menu for a new actor, RaceMenu's UI is in the layer,
  the look is recorded and restored (section 1.2). Missing: proof of the
  fresh-profile path. The lab's a-character-creation and a-racemenu run on
  profiles 1 and 2 from presets after `open-race-menu`; no scenario logs a
  third profile into a clean world with no preset and checks that the menu
  opens on its own, the look lands, and the next login restores it.
  HYPOTHESIS: it works, because it is upstream's path (spawn.ts createActor
  with the menu open) and the fork changed its validation, not its trigger.
  The helmet and the start are G9 and section 2.2.
- **G5. Network exposure.** Exists: a dark lab with nothing inbound; the
  estate's DMZ pattern with a reserved stub VM 520 (core); unsecure tokens
  on the game port (section 1.2), which make the password a courtesy gate.
  Missing: the DMZ sibling server itself, its pf pass for UDP 7777 (and
  nothing for 3000), the forward, the A record, the split-horizon record; a
  server-settings for it (password set, `enableConsoleCommandsForAll` false,
  the UI port bound to loopback or the VLAN); the promotion step that moves
  a gated image and a world onto it. Question (D3): is Eli's own seat then
  fenestrate reaching the DMZ server like a friend does, or a lab clone with
  a route?
- **G6. Announcements.** Settled by Eli (2026-10-19): the existing bot and
  channel. Exists: canon/discord.py on kalpa with canon.toml inputs.
  Missing: a thuum canon.toml and the announce step wired to the gate.
- **G7. The playtest tooling a friend session needs.** Exists: labCommand
  (teleport, give, set-percentages, console, open-race-menu) through the
  unauthenticated RPC port, the playtest profiles, world save and restore,
  the recorder. Missing: the same operator controls on a server whose UI
  port is not public (an SSH-tunnelled or loopback RPC), and a decision (D6)
  on whether a friend's server runs the lab gamemode's console at all.
- **G8. After M3's own state exists.** A friend hosting a cell over the
  internet (ADR-035: the first player to load a cell hosts it, a 5 s grace
  on leave, no takeover by ping), the handoff when the friend's game drops,
  and HostedActorState's rate over a WAN link. The lab's netem faults
  (docs/LAB.md "Network faults") are the proxy for the WAN until a friend
  exists; this cannot be built before M3's host verbs.
- **G9. The start: no helmet, a visible face, and whether Alternate Start
  is in.** Section 2.2; decisions D7 and D8.

### 2.1 Mod dissemination: the straight answer

Eli: "we're doing vortex profiles, yeah? is there a way to do one download
script slotted with a nexus API key that then sets up the profile?"

What Nexus's own documents say (fetched 2026-10-19):

- **The API.** The public API definition (SwaggerHub,
  https://app.swaggerhub.com/apis-docs/NexusMods/nexus-mods_public_api_params_in_form_data/1.0,
  read as its JSON at api.swaggerhub.com) authenticates with an `apikey`
  header holding a personal key from the user's account page, and says:
  "NEVER share your personal API keys with any other user, or include it as
  part of your own software." The download endpoint,
  `GET /v1/games/{game_domain_name}/mods/{mod_id}/files/{id}/download_link.json`,
  is described as "Generate download link for mod file. For premium users,
  will return array of download links with their prefered download location
  in the first element." and then: "Non-premium members must provide the key
  and expiry from the .nxm link provided by the website", with `key` "Key
  provided by Nexus Mods Website" and `expires` "Expiry of the key"; clients
  "extract them from the nxm link before sending this request. This ensures
  that all non-premium members must access the website to download through
  the API." Rate limits: 2,500 requests per 24 hours, then 100 per hour.
  `md5_search/{md5_hash}.json` and `files/{file_id}.json` are open to any
  key, which is how docs/MODS.md's md5 checks were made.
- **The acceptable-use policy**
  (https://help.nexusmods.com/article/114-api-acceptable-use-policy, updated
  2020-12-01) lists as unacceptable: "Storing user API keys on your own
  server and/or using them without the action being initiated by the user";
  "Using personal API keys for a public-facing application"; "Fetching data
  en-masse with the intent to rehost this information on your own service
  (i.e. scraping)".
- **Collections** (modding.wiki, "About Collections",
  https://modding.wiki/en/nexusmods/collections/about, as the search excerpt
  renders it; Nexus's own video "How to download a Collection as a Free
  User", https://www.nexusmods.com/site/videos/87): Premium users "are able
  to queue the download and installation of an entire collection of mods",
  "as close to a one-click installation as possible"; "Free users on the
  other hand, while also having full access to collections, need to click
  and open the download page for every mod in a collection they want to
  download manually." Collections are curated in Vortex and installed by
  Vortex; the manifest format is open: the Collections extension's
  `ICollection` has `info`, `mods[]` and `modRules[]`; a mod entry has
  `name`, `version`, `optional`, `source` {`type` 'browse' | 'manual' |
  'direct' | 'nexus' | 'bundle', `modId`, `fileId`, `md5`, `fileSize`,
  `logicalFilename`, `fileExpression`, `updatePolicy` 'exact' | 'latest' |
  'prefer'}, `choices` (the installer's options), `patches`,
  `fileOverrides`; rules are 'before' | 'after' | 'requires' | 'conflicts'
  | 'recommends' | 'provides'
  (github.com/Nexus-Mods/extension-collections, src/types/ICollection.ts;
  the repository is archived as of 2026-05-20, the extension having moved
  into Vortex itself: HYPOTHESIS on the reason, the archive notice is the
  fact). Whether a hand-written collection.json can be installed without
  publishing it through Vortex's curation flow is not stated in what was
  read: unverified.
- **Vortex headless.** Its documented command line (Vortex wiki,
  "Command-Line Parameters",
  https://github.com/Nexus-Mods/Vortex/wiki/MODDINGWIKI-Users-Troubleshooting-Command-Line-Parameters)
  has `--download` ("Vortex will open and start downloading the file at the
  requested URL"), `--install` ("Vortex will open, then download and
  install the file at the requested URL"), `--game`, `--profile`,
  `--start-minimized`, `--user-data`, `--shared`, `--run` ("Execute the JS
  program instead of Vortex itself") and the rest; none runs it headless or
  installs a mod or a collection without the GUI. Wabbajack, the other
  manifest-driven installer, documents the same split: without Premium the
  user clicks a download button per mod (its FAQ as the search excerpts
  render it; github.com/parsiad/wabbajack-autodownload exists to automate
  those clicks, which is the kind of thing the AUP's discretion clause is
  about).

The straight answer:

1. The one-script-with-an-API-key path exists only for a Premium account:
   the key alone returns download links. A free account's key can list a
   mod's files and check md5s but cannot get a download link without the
   website's `key` and `expires`, so every file is a click on the site. The
   key in that script must be the friend's own, entered on their machine:
   the AUP forbids our key in a public-facing tool and forbids holding
   friends' keys on our side.
2. The Vortex collection is the one-click path for everyone, with a click
   per mod for free users and no headless drive. Our layer can produce one:
   the 5 Nexus additions and the hundred Fenestrate-sourced mods all carry
   Nexus ids, file ids and archive md5s (lab/layer/essentials.tsv's notes;
   docs/MODS.md's provenance table), and the FOMOD folders each row takes
   map to a collection entry's `choices` (HYPOTHESIS on the effort: the
   mapping from "take" folders to the installer's option names is by hand
   per mod). Our own files (the client dist, rotfern, the Nemesis output)
   are not on Nexus and ride the token path as `direct` or `bundle` entries
   or outside the collection; the licensed game files are in neither.
3. Whichever route delivers the files, our verify-against-the-manifest
   script is needed, because the server requires byte identity (every form
   id past a differing plugin disagrees) and today enforces nothing
   (section 1.3): the script is the gate until G3a lands, and the second
   gate after.

### 2.2 The start: the helmet, and Alternate Start

**Where a new character's equipment comes from.** The gamemode creates the
actor with no base (`createActor(0, ...)`, spawn.ts:27-33); PartOne gives it
a fresh form id (PartOne.cpp:235-253) and MpActor substitutes base `0x7`,
the vanilla `Player` NPC_ record, when none is given (MpActor.cpp:134-137).
The first time its inventory is touched, `EnsureBaseContainerAdded` seeds
it from the base record: the record's inventory objects, then its default
outfit's items, which it also equips (MpObjectReference.cpp:1975-2015;
`GetOutfitObjects` evaluates the NPC_ template chain for `UseInventory` and
reads the OTFT record's list, 1903-1927). No server setting and no gamemode
code names a starting kit: `startPoints` is the only start setting
(server-settings.json:128-130; settings.ts), and the lab gamemode gives
items only on `give` (gamemode.js). What the lab saw: the lab character
"wears the whole iron set" (docs/verbs/headshot.md:289), read back as
"12e46/8 12e49/4 12e4b/80 13790" (Iron Gauntlets, Iron Armor, Iron Boots,
Iron War Axe; headshot.md:311) with the Iron Helmet 0x12E4D on
(lab/scenarios/b-headshot.yaml:7, 18-20; docs/LOG.md:2085, "the iron set
kept c2's head helmeted"); the smoke's comment says an iron sword is in the
spawn kit (lab/scenarios/smoke-two-players.yaml:29;
lab/labapi/labapi/guests.yaml:62-64). And SkyMP itself knows the helmet:
before it shows the race menu, the client unequips Iron Helmet 0x00012e4d
by form id (`unequipIronHelmet`,
skymp5-client/src/services/services/remoteServer.ts:94-100, called at
861-862) so the face is visible in the menu; the server's record still
holds it worn, so it is back on the next login. That call is the exact
place Eli saw the helmet come off and go back on.

HYPOTHESIS: the helmet is base 0x7's default outfit in the lab's
Skyrim.esm, the vanilla `Player` record, applied by
`EnsureBaseContainerAdded`; the tree has no other source for it, and
upstream's hardcoded 0x00012e4d says they met the same set. (The engine's
`player.resetinventory` is commonly reported to dress the player in the
iron set for the same reason; not verified here.) Where to look: NPC_ 00000007's DOFT and that OTFT's item list
in /srv/persist/esm/1.6.1170/Skyrim.esm (lab/esm.py reads RACE and REFR
today, a small `npc` subcommand would read this; or xEdit on fenestrate),
and the clean world's change forms for profiles 1 and 2 under
/srv/lab/snapshots/clean (`baseContainerAdded`, `inv`, `equipment`).

Three places to take the helmet off, each with a different owner, not
decided (D7):

- the gamemode at `spawnAllowed` for a new actor: remove or unequip the
  helmet, or replace the kit outright (the server's inventory, R0; the
  smallest change, no wire, no layer);
- a server setting for the starting kit (none exists; a fork change, with
  its T0 test);
- a layer plugin overriding Player's default outfit (a load-order change
  through layer-stage, server and clients together; the only one of the
  three the engine applies on its own).

**Alternate Start - Live Another Life** (Nexus 272 for SSE; what follows is
from the mod's Nexus description and its TES Mods Wiki page as the search
excerpts render them, both pages having refused the fetch; mark it read,
not played): the player begins in the Abandoned Prison (cell 00021594), the
Statue of Mara "will ask you how your new life shall begin" with options
such as a soldier, a guild member, arriving by ship, and race-specific
ones; "Once chosen, the Dragonborn must sleep in the bed and their new life
will begin"; "I got caught crossing the border illegally" is the vanilla
cart; Helgen can be reached later through an innkeeper's rumour; mods that
alter the prison cell need patches (the navmesh is edited).

What it would mean here, laid out, not decided (D8):

- Today the server spawns a new character at a `startPoints` entry with the
  race menu open (spawn.ts:26-36; the lab's one point is in Tamriel at
  (133857, -61130, 14662), server-settings.json:128-130), and ADR-007
  already does the mod's main job: Unbound is marked complete, nobody rides
  the cart. The mod's addition is a chosen life: a start location, a quest
  state and a kit per choice.
- Its choice is a Papyrus quest in the player's own game, started at a new
  game. Every login here loads a generated save (docs/verbs/racemenu-sync.md
  intro), and skymp5-client blocks Papyrus events on objects the server did
  not make, OnUpdate aside (docs/MODS.md, the essentials layer's "What the
  layer needs" on the branch). HYPOTHESIS: the mod's start quest does not
  run as written under the generated save, and its bed-sleep teleport
  (MoveTo from the prison to the chosen place) would be a jump the server's
  movement rule refuses unless allowed, as the cast teleport needed its
  permitted jump (docs/verbs/cast-teleport.md). To know: one lab run with
  the plugin in a stacked layer and a fresh profile, read in the seat's log.
- Each player would be alone in the prison only by accident: SkyMP shows
  every player in the same cell, so two friends who start together meet at
  the statue. Fine as a lobby, odd as a "life", and either way the server
  owns where they end up (R0: the spawn point) and what they carry (R0: the
  kit), not the mod's script.
- Quest state: ADR-008 makes quests per-player by default with a
  world-shared allowlist; a chosen start's quest stages would be per-player
  records the server keeps, which is what the mod expects of a save.
- The shape that fits the law: the server offers the choice (a gamemode
  menu at the first login, or the statue itself as a server-owned
  activator), maps each choice to a `startPoints` entry and a kit, and the
  RaceMenu verb does the face as it already does. The mod then adds its
  places and its dialogue, if Eli wants its flavour; the authority stays
  where it is. Or the plain start: the one point, no helmet, the face
  visible (D7 alone).

## 3. The proposed shape

Lazy: upstream's offline login is the login; the game's own race menu plus
RaceMenu is the character UI; kalpa's pipeline, sync script and Discord
module are the distribution; the estate's DMZ pattern is the network; the
server's own manifest.json is the list the enforcement compares against.
Vain: one manifest, one artifact for the lab clones and for a friend, one
pipeline from the lab's gate to the friend's Discord post, and the per-seat
variable in exactly one file (the settings file, as identity.ps1 already
treats it).

**The one artifact.** A manifest in modlock's shape (apocrypha's analogues:
"the mod layer's manifest (lab/layer/essentials.tsv + load-order.tsv,
persist-mods, the rendered server-settings plugin lists) as the modlock's
source"): the engine pin (SkyrimSE 1.6.1170, SKSE 2.2.6, Address Library),
the client build by sha (the dist's files with hashes; Skyrim Platform
2.9.0, which the client already enforces), the mod files with hashes
(persist's SHA256SUMS already is this list), the plugin list in order with
each plugin's name, size and CRC32 (what the server writes to its
manifest.json, so the manifest states what the server will enforce once it
does), and which plugins the server serves. The lab clones install from it
exactly as add-mods.ps1 installs from SHA256SUMS today, so `just client-mods`
becomes a consumer of the same manifest as the friend's sync; the dist
joins the manifest and the separate client-dist.zip hop retires.

**The plan**, numbered, in build order; items 1 to 7 start in M3's first
half, 8 straddles, 9 comes after M3's first verbs.

1. Eli's decisions D1 to D4 and D6 to D8 (below), recorded as one ADR
   (deployment: a friend's seat), before any script. Lead time: a
   conversation.
2. The manifest ("roll"). On the essentials branch's tables, a renderer
   that writes the manifest beside server-settings.json, with the test that
   the three renders agree extended to it; each plugin's size and CRC32
   read from persist at roll time, the way manifestGen.ts reads them.
   Published where the clones already fetch (sky-srv's handover HTTP inside
   the VLAN) and, for a friend, at a token path on core's Caddy (core: one
   more handle block and a /rpool/dist/<token>/ directory). The pipeline is
   kalpa's shape on sky-ci's lanes: roll, manual gate, announce.
3. The enforcement (G3a), a verb of its own on the fork: the client sends
   `Hello` with its `mod_hashes` (or the manifest's per-plugin name, size
   and CRC32, if a hash per mod is too coarse), the server compares against
   its own list at the handshake and refuses a mismatch with a reason code
   the client shows; the wire contract and its validator move in the same
   commit (rule 4); the client's own check reads our manifest instead of
   upstream's gateway. Its scenario is the mismatch run in item 8. Lead
   time: it touches the wire and both ends, so it starts early.
4. The DMZ server. core's items for VM 520's stub: a vdmz IP, a pf pass for
   UDP 7777 only, the WAN forward, the A record, the split-horizon record.
   Ours: the same server image from the registry that passed the lab's gate
   (`skymp-server:<tag>`), a server-settings with `password` set,
   `enableConsoleCommandsForAll` false, the UI port on loopback or the
   VLAN, `offlineMode` true (D1), the same `loadOrder` the manifest states,
   and the world promoted from a lab playtest save (`just playtest-save`
   already makes the copy). The lab stays dark and stays the gate.
5. Identity, per D1. The lazy path: per-friend `profileId` (distinct,
   above 0; section 1.2) and the shared
   password written by the installer from an invite (a DM with their id and
   the manifest sha; the password rides in the pack as vvardenfell's does,
   never in a repo). The later path, already shaped by ADR-011 and
   token.rs: the issuer front in the gamemode (invite in, signed token out
   over HTTPS), `Secure` binding on the DMZ server, the client fetching its
   token before connect; with unsecure tokens the password is readable on
   the wire (section 1.2, HYPOTHESIS), so this path's lead time starts in
   M3's first half even if the first friend plays on the lazy one. Both
   keep the server keying actors by profile id, so the character record
   does not move between them.
6. The installer and sync script, canon-sync.ps1's shape (built-in curl.exe
   and Get-FileHash; trust only the manifest sha given; hash every local
   file; fetch only what differs; rewrite only our axes: the Stock Game
   folder's Data, plugins.txt, skymp5-client-settings.txt, the password
   file; self-update). Plus the one Skyrim-specific step: the 1.6.1170 Stock
   Game folder from Steam's depots, scripted around the friend's own Steam
   console or documented, with the exe's FileVersion checked as add-game.ps1
   checks it (add-game.ps1:51-52). Per D2 the mod files come from the token
   path, from a Nexus collection, or from Nexus through the friend's own
   key; the manifest's hashes verify the result whichever way (section 2.1).
7. Announcements, settled: canon/discord.py with its own canon.toml (title,
   server_address, base_url, channel_id) on the existing bot and channel;
   the pinned setup post (prerequisites, the downgrade, the installer, play,
   updating) and a release post per roll after the manual gate.
8. The proofs on the lab before the first friend, as T3 scenarios: the
   fresh-profile login (G4: profile 3 from a clean world, no preset; the
   menu opens, the look lands, a relogin restores it, a restart keeps it);
   the mismatch (a client with one plugin off is refused with the reason,
   once item 3 exists; until then, that the warning fires for a real
   mismatch); the start (D7: no helmet, the face visible on both screens;
   D8 if Alternate Start is in: its quest under the generated save, the
   bed's jump).
9. After M3's host verbs: the friend-as-host scenarios (G8) under netem,
   then the first friend playtest on the DMZ server with the recorder
   (ADR-033) running on Eli's seats.

**Eli's decisions**, listed apart (answered 2026-10-19 13:00 PDT in his
decisions page; the options he did not take are kept in the parentheses
for the record):

- D1. Identity: DECIDED, shared password plus per-friend profile ids now
  (vvardenfell's posture; among friends, an id is a name, not a secret),
  the token issuer later; upstream's master and Discord OAuth not pursued.
  (Not taken: the issuer first.)
- D2. Mod delivery: DECIDED, the friend's own Nexus key in our one script
  (Premium only; the hashes verified as in every path). (Not taken: the
  layer's files from a token path, the vvardenfell precedent and the only
  one-script path for a free account; a Nexus collection installed by
  Vortex, one click for Premium and a click per mod otherwise.) A friend
  without Premium is therefore out of the first playtests, or gets the
  token path later as a second script.
- D3. Server placement: DECIDED, the DMZ sibling on VM 520's stub, promoted
  from the lab's gate (core's recommendation; the lab stays dark), and
  where Eli's own seat sits for a friend playtest.
- D4. Game version for friends: DECIDED, 1.6.1170 by the scripted
  downgrade (ADR-025).
- D5. Settled: the existing bot and channel (Eli, 2026-10-19).
- D6. Operator tooling on the friend server: DECIDED, the lab gamemode's
  console through a non-public RPC. (Not taken: none.)
- D7. The starting kit: DECIDED, no helmet and a visible face by a SERVER
  SETTING (section 2.2; the source stays HYPOTHESIS until read: the
  vanilla Player base record's outfit). (Not taken: the gamemode, a layer
  plugin.)
- D8. Alternate Start - Live Another Life: DECIDED, in. The sub-choice
  (the server offers the choice and the mod supplies the places, or the
  mod runs as written and the lab measures what breaks) was left open; the
  working default is the lazy one, the mod as written first with the lab
  measuring, the server-offered choice only if the measure demands it,
  until Eli says otherwise.

## 4. The friend's experience, in order (the target)

1. **Install.** Own Skyrim SE on Steam, once online. From the pinned setup
   post: the downgrade to 1.6.1170 into a Stock Game folder (three Steam
   console lines or the installer's step), then the installer with the
   manifest sha from the newest release post. It lays SKSE 2.2.6 and the
   Address Library, Skyrim Platform and skymp5-client, the mod layer (from
   the token path, or verified after a Vortex collection install, per D2),
   and writes skymp5-client-settings.txt (the server's public name and
   port, their profile id) and the password file. Nothing of the lab's.
2. **Launch.** skse64_loader.exe from the Stock Game folder with Steam
   running; the game's main menu appears with skymp5-client loaded.
3. **Log in.** No login screen: offline mode connects with the profile id
   at the main menu (authService.ts:132-135); the password rides the
   connect token. The installer has already verified every file against
   the manifest, so the in-game check has nothing to say; once item 3
   exists a mismatched client is refused with a reason, and the fix is the
   release post's sha. (Today a wrong password shows upstream's "Update"
   dialog pointing at skymp.net, authService.ts:590-605; the installer's
   own wording replaces it.)
4. **Make a character.** The first login creates their actor with the race
   menu open; they shape it in RaceMenu; closing the menu records the
   appearance and the look on the server (ADR-026), and every later login,
   on every seat, shows it. With D7 they stand there bareheaded; with D8
   they choose a life first.
5. **Play.** They spawn at the server's start point (server-settings.json:128-130)
   and then where they last were; Eli's seats join; a release post means
   "run the sync again with this sha" and nothing else.
