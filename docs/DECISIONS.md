# DECISIONS

Architecture decision records. One paragraph each. A session that wants to
reverse one opens a new ADR that supersedes it; it does not edit the old one.

## ADR-001: Build on SkyMP, not Skyrim Together Reborn

Status: accepted (2026-09-03)

STR has the game and lacks the architecture: its server holds no world
representation and no gameplay code; state is whatever the owning client says
it is, so there is nowhere to put validation or persistence. SkyMP has the
architecture and lacks the game: authoritative server state, persistence,
server-side Papyrus, a TypeScript gamemode layer. Adding the game to a correct
architecture is a coverage problem; adding an architecture to STR is a
rewrite. We take the coverage problem.

Evidence (added 2026-09-24): Keizaal Online runs SkyMP as a public roleplay
server at several hundred concurrent players in one persistent world, so the
platform's persistence, sync, and anti-cheat posture hold at scale. The
caveat is the profile: Keizaal removed NPCs entirely and fills every role
with a player, so the server simulates players only. That proves M0 to M2
territory and says nothing about M3 to M6, which is where this plan's cost
lives. Their public repo is a mirror of upstream (ADR-013); their gamemode
is private.

## ADR-002: Hybrid authority on four rungs, hosting per cell

Status: accepted (2026-09-03)

Full server simulation would mean reimplementing AI packages, Havok, scenes,
and dialogue from observed behavior. TES3MP never did that; it records one
player as the authority for a cell and forwards. We adopt the same: R0 server
computes, R1 host computes and server validates, R2 host computes and server
records, R3 local only. The hosting unit is the cell, implemented over
SkyMP's existing per-actor host mechanism (a cell host hosts all its NPCs).
Unhosted cells freeze at last recorded state.

## ADR-003: No Rust rewrite; C++ and TypeScript as found

Status: superseded by ADR-010 (2026-09-03). Kept for the reasoning; the
conclusion no longer holds.

A server rewrite is feasible and nearly worthless: the server is the half that
already works, every unfinished item is blocked on the client half, and a
port would spend a year reaching parity with the thing that lacks the game.
The Rust ecosystem does not save time either (esplugin serves LOOT's needs,
not general record decoding; no mature Papyrus VM). Contribute to the
existing codebase in its existing languages.

## ADR-004: Frida for agent-driven dynamic tracing, x64dbg for humans

Status: accepted (2026-09-03)

The dynamic half of reverse engineering is the bottleneck. Frida scripts that
hook by Address Library ID and log to jsonl can be written by the agent from
a verb doc and run by the scenario runner unattended. Human breakpoint
sessions are reserved for questions that need eyes.

## ADR-005: TiltedEvolution is a map, not a source

Status: accepted (2026-09-03)

STR's codebase has already found many of the engine functions the client half
needs (remote actor blocking, animation sync, quest and scene handling). We
read it to learn which functions matter. We do not copy code. Corrected
2026-09-24: SkyMP is not MIT; its TERMS.md names GPLv3 and AGPLv3 with a
per-subproject license file (ADR-014 has the table). SkyMP already vendors
TiltedCore, TiltedHooks, TiltedReverse, and TiltedUI under an "All Rights
Reserved" notice in THIRD_PARTY_LICENSES, and TiltedEvolution's own license
is still unread. The rule stands on its other leg regardless: STR's client
half encodes the accident-sync model we are replacing, so copying it would
import the architecture we chose against, not just its hook points.

## ADR-006: Runtime pinned to Skyrim SE 1.6.1170, SKSE 2.2.6

Status: accepted (2026-09-03)

One runtime, one address database, one Ghidra project. Every VM keeps a
backup of the exe outside the Steam folder and runs Steam offline. A version
bump is an ADR, not a Tuesday.

## ADR-007: Post-Helgen start

Status: accepted (2026-10-04, Eli).

The Helgen intro is one long scripted scene with a single protagonist. Server
spawns new players after it (Unbound marked complete) rather than making
scene sync the first quest problem we solve.

## ADR-008: Quest policy defaults to per-player, world-shared by allowlist

Status: accepted (2026-10-04, Eli).

Mirrors TES3MP's shared-journal settings. Per-player quest state is the
default because it is the safe one; a gamemode allowlist promotes specific
quests to world-shared. The allowlist is data, not code.

## ADR-009: The scenario runner is the only thing that marks green

Status: accepted (2026-09-03)

Assertions live in scenario YAML; the runner evaluates them. Neither the
agent nor a human marks a verb done by hand, and weakening an assertion is
reviewed like a validator change.

## ADR-010: Rust by exposure order; the C++ core is strangled, not rewritten

Status: accepted (2026-09-03). Supersedes ADR-003.

ADR-003 priced a rewrite on coverage and found it nearly worthless. An RCE
chain of memory bugs in TES3MP reprices it: SkyMP's protocol is a custom one
built on RakNet, the same family, so the exposed slice is the same class of
code. Two facts set the order. Memory-safety vulnerabilities concentrate in
new code and decay as code ages, so rewriting old, stable code has the
lowest return; and the recognizer at the network edge is the exception, since
it is fed by attackers no matter how old it is. Therefore: new server code
is Rust from the first verb, and the existing C++ is replaced in exposure
order, each layer with the C++ implementation as a differential oracle:

1. transport and codec (skymp-wire), which deletes RakNet and the
   handwritten parser from the server in one step;
2. validators and message handlers, which is where every new verb adds code;
3. espm lookups keyed by client-supplied IDs, then persistence;
4. the Papyrus VM, then the world model, only if the exposed surface still
   reaches them.

Stop when the exposed surface is exhausted. The world model may never move.
Rust does not buy authority correctness (the rungs do that), does not stop
panics from being denial of service, and does not make `unsafe` safe; see
.claude/rules/rust.md.

## ADR-011: Transport is renet over netcode; quinn is the named alternative

Status: accepted pending M0 fuzzing (2026-09-03)

The lazy answer to "is there a RakNet in Rust" is yes, and it is not the
RakNet-compatible crates. Those (rak-rs, rust-raknet) target Bedrock's
protocol version, describe themselves as incomplete reverse-engineered
implementations, and were last released in 2022 to 2024; they also inherit
RakNet's lack of modern encryption, which is the wrong direction. renet is
RakNet-shaped where it matters: ReliableOrdered, ReliableUnordered, and
Unreliable channels, fragmentation and reassembly, connection management,
and encryption and authentication through renet_netcode, an implementation
of the netcode 1.02 standard with encrypted and signed packets, connect
tokens, and protection against zombie clients, MITM, amplification, and
replay. SkyMP's Networking.cpp maps onto it almost one to one. renet 2.0.0
shipped January 2026; the renet2 fork adds in-memory, WebTransport, and
WebSocket transports and optional encryption for transports that carry their
own.

Caveat that decides the M0 gate: netcode's connect tokens assume an issuer.
`ServerAuthentication::Unsecure` accepts unsigned tokens, which is fine for
the lab and wrong for a public server, so skymp-wire ships a small token
issuer (password or invite to token) as part of the transport crate. M0 also
fuzzes renet's packet ingestion and fragment reassembly directly, because
that is the analog of where TES3MP broke.

quinn is the alternative if the token model turns into a product problem or
the fuzzing finds something: QUIC with TLS 1.3, reliable streams plus
unreliable datagrams on one connection, quinn-proto as a deterministic
no-I/O state machine usable from C or C++ through bindings. The cost is a
larger dependency surface and a redesign of the channel-to-stream mapping.

Either way, one implementation on both ends: the same crate compiles into
the server and into a cdylib the SP client loads.

## ADR-012: Messages are Rust types with bounded collections; other languages consume the export

Status: accepted (2026-09-03)

The wire contract stops being a document and becomes wire-schema: Rust
types with serde derives, encoded with postcard, and every collection a
fixed-capacity heapless type so a message that exceeds its declared bounds
fails to decode instead of being trusted later. That is the LangSec move
made mechanical: full recognition before any processing, and an input
language with no more power than the messages need. No recursion in the
type graph, a hard size cap per message type, numeric message ids
append-only. The schema is exported for the TypeScript gamemode through the
napi layer and for documentation; C++ never parses wire bytes, it receives
decoded structs across the cxx bridge. If a language ever must parse bytes
itself, the fallback is a verifier-backed format (FlatBuffers) generated
from the same source, recorded as a new ADR.

## ADR-013: Base is upstream skyrim-multiplayer/skymp; the Keizaal fork is a mirror

Status: accepted (2026-09-24)

Checked by fetching both repos without blobs and counting
`fork/main...origin/main` with `--left-right`: the fork has one branch, zero
commits upstream lacks, and sits seven commits behind (dependency bumps, an
LCTN record in libespm, a CMake option, a deleted workflow; fork head
456190b of 2026-08-15, upstream head f926944 of 2026-09-08). Everything
Keizaal built is in its private gamemode and in the client mods its Nexus
collection installs. So there is no second candidate: we fork upstream,
rebase weekly (PLAN, risks), and upstream Class A work early.

## ADR-014: Licensing of our work follows the subproject we link into

Status: accepted (2026-09-24)

Upstream licenses per subproject: skymp5-server AGPLv3; skymp5-client,
skymp5-front, skymp5-scripts, skyrim-platform, savefile GPLv3; libespm,
papyrus-vm, skymp5-functions-lib, viet MIT. TERMS.md requires source
disclosure on distribution and share-alike on changes. Decisions: our fork is
public from the first commit, which we intended anyway; the skymp-wire crates
are MIT as standalone libraries (permissive, combinable into GPL and AGPL
works); wire-bridge compiles into skymp5-server and that combined work is
AGPLv3, wire-client-ffi loads into the GPLv3 client. Nobody here is a
lawyer; the operative consequence is only that nothing we build is private,
and that any gamemode we write for a public server should be treated as
distributed. Keizaal's private-gamemode posture is theirs to defend, not a
precedent we rely on.

## ADR-015: Wire dependency pins and location

Status: accepted (2026-09-24)

The scaffold's placeholder versions did not compose: postcard 1.1 implements
`MaxSize` for heapless types only behind its `heapless` feature and only for
heapless 0.7, while the workspace named heapless 0.8 with that feature off,
so `Message::MAX_ENCODED_LEN`, the constant the whole recognizer is capped
by, could not derive. Pins: heapless 0.7 with `serde`, postcard 1.1 with
`heapless` and `experimental-derive`, renet 2 with the renet_netcode release
that pairs with it, rust-version 1.88 because cxx requires it. cbindgen
(MPL-2.0) leaves the dependency graph: it is a CLI run by `just wire-header`,
the header is committed at crates/wire-client-ffi/include/skymp_wire.h, and
CI diffs a fresh generation against it. Location: the workspace lives inside
the fork as `skymp/skymp-wire/`, one subproject folder with its own MIT
LICENSE in upstream's per-subproject convention (ADR-014), so the M1
corrosion import is a relative path and the fork builds standalone. Only
wire-schema names heapless, so the old pin has one place to change when
postcard moves.

## ADR-016: Hosting, CI, and the M0 agent host

Status: accepted (2026-09-24)

GitLab on the estate (VM 110) is canonical for both repositories, the thuum
superproject and the skymp fork; each push-mirrors to a public GitHub
repository under mojibake-dev within minutes, which is how ADR-014's "public
from the first commit" holds, and the GitHub side is where upstream fetches,
weekly rebases, and upstream pull requests happen. Fork branches: `main`
mirrors upstream and is never committed to directly; `parity` is ours,
rebased onto main weekly; branches for upstream PRs are cut from main.
Upstream's own GitHub workflows keep running on the mirror (they build the
server, the client, and Skyrim Platform on GitHub-hosted runners for free,
which is the M0 Windows build); our jobs run in GitLab CI on the dedicated
sky-ci runner, never on the estate's own runner, which holds root on the
host. The agent host for M0 is Eli's Mac with the route limits LAB.md
states; sky-agent stays a reserved guest until unattended overnight loops
need it. The estate mapping (VLAN 70, guests 700 to 739, Caddy names,
storage, rollback budgets) is recorded in docs/LAB.md, not here. Scenario
authoring is review-gated as ADR-009 asks rather than tool-denied: scenario
YAML changes travel in their own commits, Eli is the required approver for
lab/scenarios/, and CI refuses any commit that mixes a scenario with other
files.

## ADR-017: The server image is the T2 runtime

Status: accepted (2026-10-04, Eli; proposed 2026-09-29).

Everything that plays a client without a game runs inside the fork's server
image on sky-srv: the headless `fakeclient` the image already ships, and
`difftest`, delivered by the fork's `difftest-build` job and executed in the
same container next to it. lab-api reaches the fakeclient through
`docker compose run` for `server: fakeclient` scenario steps, so a scenario
with `clients: []` is a complete T2 run with a result.json, a world diff and
the fakeclient's event log as artifacts (t2-fakeclient-restart was the first
green one). `just test-proto` is the same two runs from the Mac. No second
T2 harness, no test client built outside the fork's own build, and no T2 job
on sky-ci: the runner builds, the lab runs (docs/LAB.md, ADR-009).

Consequences: the server image must keep shipping the fakeclient (DistContents
expects it on every platform); a T2 scenario asserts only through labState
and world diffs, never through client views; the bridged server of M1 joins as
a second compose service and the same recipe drives both, which is what
difftest is for (ADR-010).

## ADR-018: The lab runs the current Skyrim build, and how the fork gets there

Status: accepted (2026-10-01). Eli reaffirmed "keep porting" after the port's
first crash on 1.7.104 (the player's appearance, see docs/verbs/appearance.md),
with the depot rollback to 1.6.1170 offered as the alternative and declined.

Eli's direction on 2026-09-29: the lab clients run whatever Steam ships
(1.7.104.0 tonight) and the fork is made to handle it; Steam's depot rollback
to 1.6.1170 is the fallback for bring-up, not the destination. Two facts
shape the how. First, upstream skymp still pins 1.6.1170 (Skyrim Platform
loads skse64_1_6_1170.dll by name; CommonLibSSE-NG is pinned at CharmedBaryon
b93280e8, MIT, dormant since 2024-09), and 1.7.x ships its Address Library in
format 5, which that pin refuses. Second, the actively maintained
CommonLibSSE-NG line that reads format 5 (alandtse, v9.0.0 on 2026-09-21,
v10.0.0 on 2026-09-28) relicensed to GPL-3.0-or-later on 2026-08-15. Skyrim
Platform links CommonLib statically into a binary the public fork ships, so
ADR-014 applies: pulling that line in would put the client half of the fork
under the GPL. That is Eli's call to make explicitly, not a side effect of a
dependency bump.

Decision as proposed: stay on the MIT line. The fork branch `skyrim-1.7`
carries (1) Skyrim Platform naming the SKSE DLL from the running game's
version; (2) an overlay patch on the pinned CommonLib that reads Address
Library format 5, taken from an MIT fork of the same base (Zzyxz, 2026-08-22,
about 150 lines, two commits ahead of our pin) after review against the
format's own reference header, the versionlibdb.h that ships with the
Address Library download; (3) whatever engine-layout changes 1.7 brought,
found by us with Ghidra against the analyzed 1.7.104 program rather than read
out of GPL code. The four skymp header patches are already rebased for a
newer CommonLib should the decision go the other way (they apply cleanly to
v10.0.0). Validation is T1 on a client with SKSE 2.3.1 and the 1.7.104
Address Library, then T3; until then the template keeps a 1.6.1170 game
directory beside the current one so bring-up does not wait on the port.

Consequences: the version pin in CLAUDE.md and the addrlib/ database move to
1.7.104 when the branch lands; `just addr` and the Ghidra labels follow the
Address Library for that version; the client template installs SKSE 2.3.1;
every REL::ID the fork touches is re-verified rather than assumed stable.

## ADR-019: The M1 port: SkyMP's own messages as wire-schema types, JSON at the in-process edge

Status: accepted (2026-10-04, Eli; proposed 2026-10-02). Amends ADR-012 (how C++ receives messages,
heapless) and ADR-015 (the heapless and MaxSize pins); the rest of both
stands. Built on the fork branch `m1-wire`; nothing reaches `parity` until
smoke-two-players is green on it.

What M1 replaces is smaller and better shaped than the M0 plan assumed.
SkyMP already separates format from transport: each of its 33 message types
(MsgType 1 to 33) declares one field list, `Serialize(Archive&)`, which
drives a binary encoding on the wire and a JSON form for JavaScript. Nothing
JSON crosses RakNet: a green smoke-two-players capture (run
20261001-233455) holds 7,977 SkyMP messages, all binary, of 11 types. The
client half is one DLL, MpClientPlugin.dll, that Skyrim Platform loads by
name and drives through seven C exports (CreateClient, DestroyClient,
IsConnected, Tick, Send, SendRaw, MpCommonGetVersion), converting binary to
JSON for skymp5-client and back. The server half is one interface,
`Networking::IServer`, behind which RakNet sits (mp_common/Networking.cpp).
And the binary reader is the recognizer ADR-010 is about: the input archive
loops a u32 count taken from the packet ("TODO: check n before resizing",
serialization/include/archives/BitStreamInputArchive.h), so one crafted
packet makes the server, or a malicious server makes a client, read and
append up to 2^32 elements.

Decision.

1. Every MsgType becomes a wire-schema variant, appended after the nine M0
   variants (wire id = MsgType + 8, SCHEMA_VERSION 2), with its C++ field
   list in the same order under the same JSON keys; the nested payload types
   (Appearance, Tint, Equipment, Inventory and its ExtraData, AnimationData,
   Transform, the CreateActor props, the SpSnippet arguments) come with them.
   The M0 variants stay reserved for the authority model.
2. The in-process edge is JSON, rendered and recognized by Rust. Rust renders
   a decoded, validated message as exactly what the C++ JsonOutputArchive
   writes (absent optionals omitted, `t` = MsgType, including the nested `t`
   quirks), and recognizes JSON from the C++ core and from skymp5-client
   into a typed message, validates it and encodes it. Server: a Rust-backed
   `IServer` hands the core `0x86 + JSON`, the input PacketParser already
   accepts for all 33 types, and the core's sends become WriteJson output;
   the six raw relays (SendToNeighbours) therefore forward Rust-rendered
   JSON. Client: the Rust cdylib is MpClientPlugin.dll, same seven exports,
   so Skyrim Platform and skymp5-client do not change. Deleted: RakNet on
   both ends, the BitStream archives, MessageSerializer's binary paths, the
   C++ MpClientPlugin and fakeclient (a Rust fakeclient keeps the CLI and
   event lines lab-api reads). C++ then never parses network bytes, only
   canonical JSON whose every length Rust has already bounded. This replaces
   ADR-012's "decoded structs across the cxx bridge": per-message cxx structs
   would write every field list three times for no gain in what C++ can be
   fed. The cost is JSON on every message at the edge; a typed fast path for
   UpdateMovement is the named optimization if fan-out measurements ask.
3. Collections are `wire_schema::bounded::{Vec<T, N>, String<N>}`: heap
   backed, length checked against N before any growth, at decode and at
   construction. heapless leaves the workspace: inline storage makes the
   Message enum as large as its largest variant, and SetInventory or
   CreateActor at game-sized capacities (a thousand-odd inventory stacks of
   up to about 300 bytes each) would put hundreds of KiB on Skyrim's main
   thread per decoded value. Capacities stay chosen from the game and named
   next to the type. Every message declares its byte cap (`MAX_LEN`), which
   the codec checks after reading the variant tag and before decoding the
   body, so postcard's experimental MaxSize derive leaves too; the transport
   caps reassembled messages per direction (client to server tight, server
   to client generous).
4. Channels keep SkyMP's semantics: a reliable send rides ReliableOrdered
   (the server's RELIABLE_ORDERED; the client's RELIABLE becomes ordered,
   which only ever adds ordering), an unreliable one rides Unreliable.
   Version gating is netcode's protocol id, derived from SCHEMA_VERSION, so
   mismatched peers never connect; the server password travels in the
   connect token's user data where RakNet carried "7_" + password.
5. The oracle is the last RakNet server image, pinned by digest, with the C++
   fakeclient, against the bridged image with the Rust fakeclient; difftest
   sessions come from lab captures through a test-only Rust reader of the
   legacy binary format, which also proves every captured message fits the
   declared capacities.

Consequences: once this is accepted, .claude/rules/wire.md reads "no
unbounded collections" where it read "heapless", and .claude/rules/rust.md
reads "C++ receives decoded, validated messages as JSON Rust rendered" where
it read "decoded, validated structs"; `just build` needs a Rust toolchain in
the server image and the mirror's Windows workflow builds the cdylib; the
fork's T0 loses the RakNet and BitStream tests and gains a JSON contract test
that reads the same fixtures as the Rust tests.

## ADR-020: Game rules are Rust over facts the world model gathers

Status: accepted (2026-10-03, Eli: "go with rust"). Settles ADR-010's point
2 for validators that read game state.

M1's validation verbs (activation reach, character creation, melee reach,
movement speed, damage flags; docs/verbs/) were first written in the C++
handlers, because each reads state only the C++ world model holds:
positions, equipment, game records through espm, animation events. A first
draft of this ADR proposed keeping them there; Eli chose Rust.

The shape: each rule is a pure function in skymp-wire's wire-rules crate,
over a plain struct of facts, returning a decision and the bound it used;
state a rule keeps (the movement budgets) is Rust's too. The C++ handlers
only gather the facts from the world model and ask, through a second cxx
module in wire-bridge (rules.rs) that server_guest_lib links (one Rust
static library per binary). The world model does not move (ADR-010 step 4);
the fact structs are the read-only view of it the rules see, and each new
rule adds the facts it needs.

Why it pays even though the rules parse no attacker bytes (the recognizer
already does, ADR-019): one language for new verb logic beside the new
handlers, which are Rust; tests that run under cargo in seconds instead of
inside the server's docker build; and rust.md's guarantees (no panic
reachable from a packet, overflow checks) on the arithmetic that decides
what a client may do. The difftest sessions are the oracle that the port
changed no behavior.

## ADR-021: Server-owned game time

Status: accepted (2026-10-03, Eli's decisions on docs/verbs/time.md).

SkyMP has no server clock: each client derives game time from its own PC
clock (docs/verbs/time.md). The server owns the clock (rung R0). By default
it runs at the game's own rate (Skyrim.esm's TimeScale), shared by every
player, as TES3MP does; a server setting switches to SkyMP's real time of
day. Waiting and sleeping are per player and never move the shared clock:
the player gets the rest's effects (healing, the rested bonus), the world's
time runs on. The clock runs while nobody is online. Which other globals the
server owns is deferred until a verb needs them (quests, M6), together with
the GLOB reader and its persistence home.


## ADR-022: thuum supports and tests two game versions, 1.7.104 and 1.6.1170

Status: accepted (2026-10-04, Eli: "go with B"). Amends ADR-018: the lab
still runs what Steam ships, and it now also runs 1.6.1170.

**Why.** ADR-018 put the lab on current Steam, 1.7.104. Two facts arrived
since:
- Eli's own modded setup runs on 1.6.1170. Fenestrate last ran SKSE 2.2.6
  and RaceMenu 0.4.20 there on 2026-07-22. Steam updated it to 1.7.104 on
  2026-09-02, after which no SKSE mod can load (core's read-only look,
  2026-10-04; docs/MODS.md).
- RaceMenu has no 1.7 build. Eli wants RaceMenu sync (docs/PLAN.md, stretch),
  which needs RaceMenu loading on every client.

Players who mod will run the version their mods need. That is 1.6.1170 for
RaceMenu today.

**The fork is meant to run on both.** Skyrim Platform picks the SKSE runtime
by the running exe's version, and the CommonLib overlay reads both Address
Library formats (ADR-018). Only 1.7.104 had been tested since the port, so
1.6.1170 support is proven by running it, not assumed.

**How:**
- **One run, one version.** A server and its clients run the same master
  files. skymp5-client compares each file's name, size and CRC32 with the
  server's manifest and puts up "LOAD ORDER ERROR" on any difference
  (skymp5-client loadOrderVerificationService.ts; the server writes the
  manifest from its own data directory, skymp5-server/ts/manifestGen.ts).
  The two builds' masters differ (libespm's kKnownHashcodes holds a CRC32
  per build). So a lab run picks one version, and the server's master files
  and the clients' game folder both follow it. Mixing versions in one
  session is out of scope here.
- **Two game folders on each client.** The clones keep Steam's folder
  (1.7.104) and gain a second folder holding 1.6.1170, with SKSE 2.2.6, the
  Address Library for 1.6.1170 and the same client dist. Wabbajack modlists
  do the same with a "Stock Game" folder, a copy of the game's files run
  through SKSE from outside Steam's folder
  ([Wabbajack docs](https://wiki.wabbajack.org/modlist_author_documentation/Keeping%20the%20Game%20Folder%20clean.html)).
  Both folders live in the one
  clean-m1 snapshot: Proxmox rolls a ZFS disk back only to its newest
  snapshot (lab/labapi/labapi/guests.yaml), so the version can't be picked
  by snapshot. The logon launcher asks lab-api which version the run wants
  and starts that folder.
- **Two master-file sets on the server.** /rpool/sky/persist/esm keeps
  1.7.104's masters as the default; esm/1.6.1170 holds that build's. lab-api
  starts the server on the run's set.
- **Where the files come from.** Steam's own depots for that build,
  downloaded once on one clone under an egress lease, using the Steam
  session already logged in there:
  - `download_depot 489830 489831 8442952117333549665`
  - `download_depot 489830 489832 8042843504692938467`
  - `download_depot 489830 489833 1914580699073641964` (the exe)
  - Sources: the [Wildlander wiki's downgrade guide](https://wiki.wildlandermod.com/09-How-Do-i/HowDoI/downgrade/)
    and the [Nexus article](https://www.nexusmods.com/skyrimspecialedition/articles/12471),
    which agree.
  - The depots are kept in /rpool/sky/persist/game/1.6.1170 like the other
    licensed files, never in a repo. Each clone builds its second folder
    from there over the VLAN: a copy of Steam's folder with the three
    depots laid on top, in order, as the guide does it.
- **Choosing per run.** A run takes a game version from the run request,
  else from the scenario, else 1.7.104. A scenario that needs a mod which
  only loads on one version names it; the regression sweep runs against
  both.

**Consequences:**
- Scenario runs per version double the lab time of a full sweep.
- The Ghidra project gains the 1.6.1170 program beside 1.7.104
  (docs/LAB.md), and a verb's engine facts name the version they were read
  on.
- libespm's checksum table and T0 learn the 1.6.1170 set.

## ADR-023: Hostility between players is shared by both games

Status: accepted (2026-10-04, Eli: "the fairest seems to be C. i can see a
and b being exploited").

**Context.** Eli's playtest found combat one-sided. When a player hits
another, the attacker's game marks the victim an enemy: it shows on the
compass, and the attacker cannot wait. The victim's game never marks the
attacker, because each client keeps its own combat state for the other
players. The rest verb's server-side check is "no hit dealt or taken in the
last 10 s" (docs/verbs/rest.md). So a victim could step back 10 s, rest an
hour, and return at full health, which single-player forbids ("not with
enemies nearby"; UESP, [Skyrim:Beds](https://en.uesp.net/wiki/Skyrim:Beds)).

**Options weighed:**
- (a) Lengthen the server's window. Beatable by waiting it out.
- (b) Refuse a rest while a recent opponent is nearby, on the server.
- (c) Make both games see the fight: when the server takes a hit between two
  players, the victim's game also treats the attacker as an enemy. The
  engine's own rules then block waiting on both sides, as in single-player.

**Decision: (c).** The server, which already validates every player-on-player
hit (R1), tells the victim's client that the attacker is hostile. The engine
then applies its own combat rules to both players. The server keeps its
10-second rule as the backstop for a client that ignores its own engine.

**Consequences:**
- A new verb: hostility sync. It needs the engine's surface, which actor
  state makes "enemies nearby" true for the player. That comes from
  CommonLibSSE-NG or Ghidra, not memory (rule 1), and so does how a remote
  player's actor can carry it without its AI acting.
- Until it lands, rest keeps the 10-second rule alone.

**Amendment (2026-10-05, Eli: "60 seconds OR walk apart"):** a fight ends.
In Eli's third playtest the aggro never expired: each game's figure of the
other player is an AI in combat, and such an AI gives up only when it loses
its target, while players stand side by side. The server now ends a fight
when neither player has hit the other for 60 s, or when they have stood
farther apart than the engine's "enemies nearby" range for 5 s (3000 units
outdoors, 2000 indoors). Both games then stop their figure's combat
(Actor.StopCombatAlarm). Until a fight ends the server also refuses its
players a rest, however long ago the last hit. Other options weighed: 10 s
or 30 s without a hit (an exploit window: step back and rest), and distance
alone (standing together never ends it).

## ADR-024: The full sweep runs at the merge, not per verb

Status: accepted (2026-10-05, Eli: "please yes that's great").

**Context.** A full sweep is every committed scenario on both game versions
(ADR-022): 21 scenarios twice, about two hours of lab time on the single
pair of clones. Running it for each verb on its branch, and again after
landing, made the sweep the largest wait in a verb's cycle (the map-markers
verb, 2026-10-05).

**Decision.**
- While a verb is in progress on its branch, T3 is its own scenario on both
  game versions plus `smoke-two-players`.
- The full sweep runs once, when the branch merges into parity. It runs
  overnight when that is possible, and a red run blocks the merge.
- A change that touches every client (a snapshot retake, a wire schema
  bump) still gets the full sweep before its snapshot is promoted.

**Consequences.** A regression in another verb's scenario is found at the
merge, not on the branch. The merge commit names the sweep's runs, so
"green at merge" stays checkable.

## ADR-025: Players run 1.6.1170, with a 1.6.1170-era mod layer

Status: accepted (2026-10-06, Eli: "lets pin to a 1.6.1170-era mod
layer"). Amends ADR-022 (1.6.1170 becomes the default version, and 1.7.104
leaves routine testing) and ADR-024 (its sweep runs on one version).

**Context.** RaceMenu does not run on 1.7.104, confirmed live on
2026-10-06: skee64.dll 0.4.20.0, the newest on Nexus, lists only 1.6.1170.0
as compatible and claims no version independence, and SKSE 2.3.1 on
sky-c1's Steam game disabled it as "incompatible with current version of
the game" (docs/verbs/racemenu-sync.md). RaceMenu sync is how players make
their own characters (Eli, 2026-10-06), so players run a game RaceMenu
loads in.

**Decision.**
- 1.6.1170 is the version thuum's players run and the lab's default: a run
  that names no version, a playtest, and the server's master files outside
  a run (lab-api's GAME_DEFAULT; compose's ESM_DIR). The mod layer is built
  for it: RaceMenu 0.4.20.0 joins it in the 1.6.1170 game folders and the
  1.6.1170 server load order with the RaceMenu sync verb.
- A player who installs today gets 1.7.104 from Steam and downgrades once
  with Steam's depots for 1.6.1170 (ADR-022's three `download_depot`
  commands), into a game folder outside Steam's that it launches through
  SKSE (the "Stock Game" layout, ADR-022), so Steam's updates never reach
  it. A patched exe alone does not connect: the server compares each
  master's name, size and CRC32, and 1.7.104's masters differ. The lab
  fetched those depots on 2026-10-04, a month after Steam moved to 1.7.104.

- 1.7.104 leaves routine testing (Eli, 2026-10-06: "yes retire it from
  routine testing"). A verb's T3 is its scenario on 1.6.1170 plus
  `smoke-two-players`, and the merge sweep (ADR-024) runs on 1.6.1170 only,
  half the lab time. The clones keep Steam's 1.7.104 folder, persist keeps
  its masters and depots, and the Ghidra project keeps its program, so a
  run can still name 1.7.104: `smoke-two-players` there when Steam or
  RaceMenu changes.

**Consequences.** A player-facing install guide (the downgrade, the Stock
Game folder, SKSE 2.2.6, the Address Library for 1.6.1170) comes with the
public server (M2). The 1.7.104 server keeps today's load order: RaceMenu's
plugins are full slots and join only the 1.6.1170 one.

## ADR-026: A player's look is the one record of its face and body

Status: accepted (2026-10-08, Eli: accept, built in M1 alongside the
actor-value server work; proposed 2026-10-07 from his question: "take the
output of race menu as overriding and authoritative, and then from there let
the server fully enforce it").

**Context.** A character is recorded twice. SkyMP's appearance (the vanilla
UpdateAppearance, read from the player's base at the menu's close) carries
race, head parts, skin and hair colour, weight and the engine's tints; the
RaceMenu look (docs/verbs/racemenu-sync.md) carries the same under its own
names plus the sculpt, RaceMenu's sliders, overrides, transforms and body
morphs. The two can disagree, and did: on 2026-10-07 the live face dump
found the appearance for profile 2 holding the Nord race's head and mouth
parts, recorded from a menu session the actor sat in under the race it had
loaded as, while the look held rotfern's parts; the player's own seat drew
the appearance's. The client fix (0513beba: the look goes on only once the
actor's race is its base's) stops that path, and leaves the two records.
One authority per piece of state is the law (CLAUDE.md).

**Decision.** Where RaceMenu is present, the look is the record
of a character's face and body, and the appearance is derived from it on
the server: at OnRaceMenuPreset the server resolves the look's head parts
(formIdentifier against its own load order), race, hair colour and weight
into the actor's appearance (R0), refuses a look whose head parts are not
valid for its race (the race rule that already guards the appearance), and
sends the derived appearance with the look. The appearance message stays as
it is (the wire does not change); a client's own UpdateAppearance after a
menu close is accepted as today but superseded by the derivation when the
look of the same menu arrives. Without RaceMenu (1.7.104) the appearance
stands alone, as now.

**Consequences.** `a-racemenu` asserts the appearance's head parts equal
the look's after a menu close; the server needs the plugin-name to index
map it already has for its load order; skin tone stays the appearance's
until the look's tintInfo is read the same way (a second step). The
hairline and other extra parts that RaceMenu lists only through their hair
must be derived with the engine's extra-part rule, or the appearance loses
them. Tints stay the appearance's for good reason, measured 2026-10-08
00:26: RaceMenu's own save carries only the tint layers it set itself (six
against the preset file's thirty, lips and nose missing for rotfern), so a
look applied over the engine's layers clears them; the appearance, read
from the base, keeps them. Built 2026-10-08 on fork m1-actor-values (e83b8ded):
the race rule's part of the decision checks each head part's valid-race list
(RNAM) as the winning override has it; a look carries no race, so the race
itself stays the appearance's and its character-creation check. Until the
light-plugins verb, a head part from a light plugin refuses the look.

## ADR-027: A merge sweep's lone red that reruns green is a watch item, not a block

Status: accepted (2026-10-09, Eli's M2 form: accept; proposed the same morning). Amends ADR-024.

**Context.** ADR-024 says a red run blocks the merge. Twice a merge went
ahead on reruns instead, a choice made in the session, not by this record:
the RaceMenu leg's sweep (2026-10-08, 24 of 27, its three reds green on a
rerun, fork parity c8b26bf7) and the m1-console sweep (2026-10-09, 29 of
30: a-racemenu red once, run 20261009-080458, on c2's figure of c1 drawing
its head at 1.0 under RaceMenu's recorded 1.6 after a reconnect; green on
two reruns with nothing changed, 20261009-084041 and -084413; fork parity
89db8732). Each red came from a scenario green on the same code before
the sweep, and each rerun ran the same images and snapshots. A sweep is
about 80 minutes on the one pair of clones, so a block costs a night.

**Decision (proposed).**
- A red in a merge sweep still blocks the merge, unless all of these hold:
  it is the sweep's only red; that scenario was green on the branch before
  the sweep; it reruns green twice in a row with nothing changed; and the
  red is read (the failing assertion and its values) and written into the
  verb doc as a watch item with a HYPOTHESIS.
- The same watch item red again in either of the next two sweeps makes it
  a bug: the next merge waits for its fix.
- The merge commit names the red run, the two reruns and the watch item,
  so "green at merge" stays checkable (ADR-024's consequence).

**Consequences.** Lab timing (a figure's 3D built after its look, a
driver's race) no longer holds a merge for a night, and a regression that
shows only sometimes still blocks on its second red. Several reds in one
sweep, like the RaceMenu leg's three, block under this rule.

## ADR-028: The server computes the damage one actor deals another

Status: accepted (2026-10-09, Eli's M2 form: accept; proposed with M2's chart, docs/PLAN.md).

**Context.** CLAUDE.md puts damage numbers on R0, and M2's exit asks for
server-authoritative damage between two players. The survey of the fork at
parity 89db8732 found that true for melee only: OnHit runs the TES5
formula and sends the victim its health (ActionListener.cpp, OnWeaponHit).
A remote player's spell is cast inside the victim's own game, whose engine
applies its damage (skymp5-client remoteServer.ts, the figure's cast;
Skyrim Platform MagicApi.cpp), while the caster's own hit report reaches
the server's OnSpellHit as well, so a spell may count twice (unmeasured).
The server takes any fall of health a client reports (CropRegeneration
clamps rises only), and a client's report of its own death kills it
(MpActor.cpp, OnChangeValues). A potion is drunk by the game and written
to health by the server.

**Decision (proposed).**
- The server computes every damage an actor deals another (weapons in
  melee and at range, the arrow included; spells and their effects;
  poisons) and every restore an actor's own spell or potion gives it (R0).
  No game applies these on its own: a remote figure's weapons already deal
  none (skymp5-client formView.ts, attackDamageMult 0), and its spells and
  projectiles are made to deal none the same way; a player's potion takes
  effect through the server.
- Damage the world deals (a fall, drowning, lava, a trap until M4 runs the
  traps) stays the victim's game's: its health reports record it, and its
  report of its own death is taken as the world's, logged (R2,
  unvalidated). A client can hurt or kill only itself this way.
- A client's reported health still never rises faster than regeneration
  allows (as today).

**Consequences.** Spell damage moves to the server with M2's spell-cast
verb, ending the second path; `b-duel`'s server-authoritative damage is
the rule rather than a test. TGM is a server flag in these rules, while the
world's damage to a god stays the game's own god mode's (Debug.setGodMode).
The server needs the game's formula for each kind of damage it takes over:
the weapon's today, the arrow's with marksman, a spell's magnitude with its
effects and resistances with magic-effects.

## ADR-029: Spell scripts run in the caster's game, an allowlist's on the server

Status: accepted (2026-10-13, Eli's Apocalypse form, docs/private/
decisions-m2-apocalypse.md: "hybrid: A by default, plus a server-run
allowlist grown verb by verb", and the MCM settings "each player's own, like
their progress"; proposed 2026-10-11).
Eli, 2026-10-12: "for apocalypse, im unsure. im leaning the later for
authoritativeness tbh, but like headshots im not opposed to trusting the
client": a lean to the alternative below (the server's VM runs the effect
scripts). The costed comparison (2026-10-12, docs/apocalypse-options.md)
priced the first proposal (the player's game runs them) at 7 to 12 sessions
to b-apocalypse and the alternative at 25 to 40 for the mod, and
recommended the hybrid Eli chose: the first proposal by default, with an
allowlist of effect scripts the server's VM runs, added verb by verb
(ADR-008's shape).

**Context.** M2's plan puts Apocalypse after a small step that gives the
server its global variables, on the premise that most of its spells ride
spell-cast's path. A survey of the fork and the mod (2026-10-11, the
session scratchpad's globals-survey.md) found the premise half true: the
spells' records do ride it, but their scripts run nowhere. The server's
Papyrus VM instantiates scripts only on references
(skymp5-server/cpp/server_guest_lib/MpObjectReference.cpp:1750-1800), so
no magic effect, quest, alias or perk script runs there; each client's
game blanks every Papyrus event but OnUpdate unless a script on the
handle is SkyUI's, RaceMenu's or defaultDisableHavokOnLoad
(skyrim-platform FridaHooks.cpp:43-87, set by skymp5-client
blockPapyrusEventsService.ts). Apocalypse 10.2.3 is 206 scripts, 162 of
them ActiveMagicEffect scripts; 114 of its 265 global uses run from
OnEffectStart, 82 from its MCM. Its 99 globals sort into settings (30,
written by the MCM), static tuning (13), a caster's build or progress
(25: the Craftlord's points, the Battlemage's upgrades, the Avenging
Wraith's stats), per-cast hand-offs and locks (5), world objects (7: the
Milestones' five anchors, Cyclonic Rift, Entomb) and unused (19).
Vanilla's scripted effects meet the same blank (INFERRED: which ones, and
what a player misses, is unmeasured). TES3MP's answer, the prior art:
clients run the scripts, and the server sorts the globals they write
into personal and worldwide by a list, saving and relaying the shared
ones (CoreScripts clientVariableScopes.lua, eventHandler.lua).

**Decision.**
- By default a player's game runs the scripts of the magic effects on its
  own player and of those its player casts: their events pass the blank,
  while references', quests' and aliases' stay blanked. The engine and the
  mod do the work (the design law: we do not reimplement what a game runs
  for us).
- The server's VM runs the effect scripts an allowlist names, and every
  game blanks those. The allowlist is data, not code. It starts empty and
  grows one verb at a time where authority matters most, each entry
  bringing the natives its script calls (a ledger line each, rule 10). Its
  natural first entries are the scripts that change another actor's
  attributes or life, ADR-028's ground (23 of Apocalypse's; Nature's
  Balance the first), then the world mechanisms (Raise Wall, Cyclonic
  Rift, Entomb, the Milestones). It is the shape ADR-008 gives quests and
  TES3MP gives client globals.
- A script's changes keep the rungs their state already has: damage and
  restores between actors stay the server's (ADR-028), so until its script
  is on the allowlist a script's change to another player's figure stays
  in that game, as a figure's spell lands nothing there today
  (docs/verbs/spell-cast.md).
- A global a player's game writes is that player's (R2, recorded
  unvalidated), Apocalypse's 30 MCM settings included: the server keeps it
  in the player's change form (a migration, rule 6) and sets it in the
  game at login. A global a data list names world-shared (the Milestones'
  anchors) is the server's one value (R1: a game proposes a write, the
  server records and relays it). The GLOB reader comes with the first verb
  that needs a record's value.

**Consequences.** Apocalypse's scripted spells work in their caster's
game, and its progress and settings follow the player between sessions.
The first verb is the filter with Ghostwalk as its spell (its return
taken as a permitted jump, as cast-teleport's landing), then the
per-player globals (docs/apocalypse-options.md, section 5). The server's
effect runtime (OnEffectStart and OnEffectFinish, timers, the effect's
conditions or the engine's word that it started) is paid at the first
allowlist entry, not up front, and every spell works in its caster's game
meanwhile; promoting all 65 scripts that touch others or the world
converges near the server-runs-all cost (22 to 35 sessions), spent in an
order Eli can stop at. What spells put into the world for others (a
summon, a wall, an anchor) is the summons' and placed objects' work (M3
hosting, M4) unless the allowlist takes it first, named in each verb doc.
Unblocking runs mod code in a player's game, which is why the filter is
the player's own effects only. Running every effect script on the
server's VM instead would mean implementing the natives those scripts
call (102 of Apocalypse's 165 are missing on the server) for spells whose
effects are mostly the caster's own, and 93 of the 157 live effect
scripts call something only a game can do.
Open for Eli at the first allowlist entry: whether b-apocalypse keeps
Raise Wall, and whether the server evaluates an allowlisted effect's
conditions or takes the engine's report that it started.

## ADR-030: The merge runs a gate sweep; the full sweep runs nightly

Status: accepted (2026-10-13, Eli: "im approving the ADRs in the policy section";
proposed the same day from the process audit, ~/.claude/plans/serene-frolicking-cascade.md
in the agent's plans). Amends ADR-024 and ADR-027.

**Context.** ADR-024 put the full sweep at the merge, ADR-025 halved it to one game
version, ADR-027 kept a lone red from costing a night. Measured over the sixteen sweeps
since 2026-10-07 (1,038 lab runs): a sweep is 68 min for 26 scenarios and 124 min for 43,
strictly serial on the one pair of clones, growing one scenario per verb; sweeps were 540
of the 1,038 runs and 25.1 of the lab's 47.5 busy hours, while the lab itself is busy
three to five hours a day and idle the rest. From a branch's last fork commit to its merge
is a median 3.0 hours, which is the sweep, T2 and the bookkeeping. So the sweep's cost is
where it runs, on the merge's critical path, not that it runs; at M3's sixty scenarios it
would be two and a half hours per merge.

**Decision.**
- At a merge to parity, the gate sweep: `smoke-two-players`, `a-restart-persistence`,
  the merging verb's own scenario(s), the scenarios of every verb whose server, wire or
  client files the branch touched (each scenario names its verb; a `touches:` list in the
  scenario, or the verb docs' file and message names, gives the mapping), and every
  scenario with an open ADR-027 watch item. About ten runs at 2.6 min each, about 26 min.
  A red in the gate blocks the merge under ADR-027's rules.
- The full sweep, every committed scenario on 1.6.1170, runs on a nightly schedule through
  lab-api, unattended, when no playtest or staging holds the lab. A nightly red reopens its
  verb (docs/LAB.md, CI): the next merge waits for its fix or its ADR-027 watch item.
- A verb's own client change is promoted to clean-m1 on its gate; the nightly sweep is its
  full check. The full sweep still runs first, as ADR-024 asked, before a promotion that is
  not a verb's merge: a snapshot retake, a change to the mod layer, the game, SKSE, Skyrim
  Platform's build or the lab driver stack, where no verb's scenario names what changed.
  (Most M2 verbs change the client; had every promotion kept the full sweep, the gate
  would have saved nothing.)
- Merge trains: verbs whose branches are green within a few hours of each other stack (by
  merge, never rebase) and merge together under one gate sweep and one promotion, as
  magic-effects with god-mode and poison with the visual fixes already did. The merge
  commit names every verb it carries.
- The merge commit names the gate's runs; the nightly sweep's result is a run set under
  lab/results that the next session reads first.

**Consequences.** A cross-verb regression the gate's selection misses shows at night
instead of at the merge; ADR-027's two-sweep rule already tolerates that shape, and the
nightly sweep gives the flakiness statistics for free. The sweep stops growing the merge's
critical path. The tooling (`just verb-merge`, a lab-api run set with the ADR-027 and
lab-fault reruns encoded, the nightly schedule) is the process audit's items B1 and B3;
until it exists the gate set is run by hand at a merge, named in the merge commit.

## ADR-031: The server decides an action and its numbers; the engine plays the rest

Status: accepted (2026-10-13, Eli: "accept ADR-031, item 3 included";
proposed the same day from his question: "there's gotta be a more wholistic
approach than one element of a thing at a time"). Amends ADR-028 (how "no
game applies these on its own" is enforced) and docs/VERB.md (an inventory
and a parity check per verb).

**Context.** A game action is a bundle: a hit has its number, the swing,
the victim's reaction (a recoil, a stagger, a throw), the impact's art and
sound, a blood shader, the HUD. The verbs so far start from the authority
question (who owns the number, which message carries it) and read the
engine only for the hook that question needs. Nothing lists the whole
bundle first, so a verb ships the parts it set out to build, and the
playtests find the rest one at a time:
- the concentration push on a figure (fifteen; docs/verbs/spell-cast.md);
- Unrelenting Force's throw (fifteen; docs/verbs/stagger.md);
- no flame and no burning on a spell's target (spell-cast.md, "a T4
  question");
- the block-and-stagger animation missing on the figure (stagger.md,
  fifteen);
- the teleport's vanish and appear, TCL's figure (docs/PLAN.md M2).

Two habits make it worse:
- **The suppressions cut events, not numbers.** To keep damage on the
  server (ADR-028) each verb blocked a whole path, and each block drops
  every consequence after it:
  - a figure's spell lands nothing on the player it targets
    (spell-cast.md, x-spell-observe 20261010-114556). This is an accident
    of the target lookup that the verb kept: the relayed cast names its
    target by server id, and the client turns the player's own id into
    form 0;
  - a figure's weapons deal no damage (formView.ts, attackDamageMult 0);
  - the player's own engine counts no actor damage (m2-visuals);
  - a figure's stagger the server did not relay is blanked (deathService);
  - a drinker's engine applies no potion (SetPotionEffectsBlocked).
  The verbs then re-add the consequences one at a time: the server's
  stagger, spell staggers, hit shaders through magicEffectsService, the
  throw next. That rebuilds what the engine already does.
- **The scenarios assert what a verb meant to change** (the server's number
  and one look). A missing consequence fails nothing and waits for a
  playtest.

**Decision.**
1. **Inventory first.** Before its rung, a verb's doc lists the action's
   consequences in the engine, from two sources:
   - a reference trace: the action in one game, against a local NPC or the
     player itself, with no multiplayer path involved;
   - what the records declare: WEAP, the race's ATKD, MGEF, SPEL, SHOU,
     PROJ, EXPL, IPDS (lab/esm.py).

   The trace records at a few engine chokepoints, found once by the
   re-analyst on sky-re and hooked by Frida or Skyrim Platform:
   - graph events and graph variables on both actors;
   - effects, shaders and art applied;
   - sounds and impacts;
   - physics: a ragdoll, an impulse, positions;
   - actor value changes;
   - HUD messages.

   The recorder is built once and serves every verb.
2. **Every item gets a disposition** in the verb doc:
   - native: the engine plays it in the game that hosts the subject;
   - imposed: the server tells a game to play it;
   - suppressed, with the reason;
   - later, with the slice that takes it.

   An item without one blocks the merge, as an undeclared rung does.
3. **Cut at the number, not at the event.** The server's authority is over
   decisions (did it land, how hard, from whom) and over numbers (actor
   values). The server's decision reaches the subject's host game as the
   cause: this hit, or this spell, from this source, at this magnitude.
   That game applies the cause through the engine's own path (for a spell,
   MagicCaster::CastSpellImmediate, CommonLibSSE-NG
   include/RE/M/MagicCaster.h:46; the weapon hit's path is to find), so the
   consequences come as the engine makes them. The game suppresses only the
   local change of a number the server owns, at the value-change
   chokepoint, never the event carrying it. ADR-028 stands for the
   numbers: "no game applies these on its own" now means no game changes
   those values on its own, not that nothing lands.
4. **Verify by diff.** A parity scenario per action class records the same
   trace in the multiplayer run, from the actor's game, the target's and a
   bystander's, and compares each with the reference. A consequence
   missing or extra in a viewpoint is red unless the inventory marks it
   later. The reference traces are committed with their scenarios, alone,
   for Eli's review (ADR-009).

   This is differential testing with the engine alone as the oracle
   (McKeeman, "Differential Testing for Software", Digital Technical
   Journal 10(1), 1998), the same shape as T2's harness (ADR-010). Unreal's
   Gameplay Ability System draws the same line, between attribute changes
   the server owns and "cues" every client plays
   (github.com/tranek/GASDocumentation, GameplayCues).

**Consequences.**
- A verb's gaps are listed before it is built; a later slice is a named
  inventory item, not a playtest surprise.
- Rebuilt consequences can retire (the server's stagger impose, spell
  staggers, the hit shaders) where the engine plays them from the imposed
  cause. Each retirement is a verb change with its own scenario evidence.
- RE needed, once:
  - the value-change chokepoints, where a local change of health,
    magicka, stamina and their maxima can be zeroed with the rest intact
    (one candidate: the health damage function,
    ghidra/notes/block-formula.md:427);
  - the engine path that applies a decided weapon hit to a target;
  - the trace's chokepoints.
- Not solved here: a bystander's view of a body the engine moves (a throw,
  a ragdoll). The movement relay positions a figure and carries no pose.
  It is the first named "later" item.
- A game's own physics never decides a hit on a player: the target's host
  plays what the server decided. The figure's own projectile in the
  target's game stays harmless as a cause, which is ADR-028's ground.
- First slice:
  - the recorder, with the inventory and the parity check for the merged
    combat verbs (melee hit, block, stagger, spell hit, shout), which gives
    the gap list;
  - then Unrelenting Force's throw, the first verb built this way: the
    server imposes the spell's hit from the shouter's figure, and the
    engine throws.

## ADR-032: A figure plays the caster's actions; the server decides the effect

Status: accepted (2026-10-14, Eli, on the plan of that night: "we want the
most wholistic fix that extends to how we do the rest of the magic system";
"melee can stay how it is, withheld spells should also show anims because
that's cool"; the research was his brief: "pin down how magic animations and
effects are handled before doing apocalypse"). Built as the cast-action verb
(docs/verbs/cast-action.md). Refines ADR-028 and ADR-031 for magic.

**Context.** Playtest eighteen left three notes on the hands: a figure's
Flames grab-and-push "initiates, but does not stop", a left-hand Firebolt
left the figure's right hand, and a spell on oneself showed no cast at all;
sixteen's and eighteen's god-mode breath showed once of twice. Each had its
own cause (docs/verbs/spell-cast.md, "The hands, read whole"), and the
causes shared a shape: the relay copied the caster's graph events one at a
time (an unreliable channel, with the Equipped exit rewritten into a draw
flag and lost), re-derived the hand from the casters' states, and held a
start until the figure's variables caught up (fork m2-hands). The engine
enters a hand's cast only through the actor's own MagicCaster, whose every
graph-facing step is a BGSAction performed through one entry,
ActorMediator::PerformAction (38949 on 1.6.1170: Attack, Ready, Release,
Interrupt, the idle chosen from the actor's conditions, the event the idle
names). TiltedEvolution hooks that entry and replays it (a map, never
copied; ADR-005).

**Decision.** Magic on a figure has two axes with one rule each.
1. **Animation: the figure plays the caster's actions.** Skyrim Platform
   reports every BGSAction the player's actor performs (the action, the
   idle the engine chose, the graph event, the input type, the actor's
   master-behavior variables as the graph was asked); the hands' cast
   actions go to the server as UpdateAction (MsgType 44), reliable, in
   order; the server relays them to the actor's neighbours but the sender
   (R2); each neighbour's view performs them on the figure through the
   engine's second entry (38953, a data performed as given), the caster's
   variables one update before the action. The graph then does what it
   does for the caster: the start idle, the loop, the Equipped exit, the
   hand, the dual idle without the perk, the Self cast. A withheld spell
   (the teleport's marker, later summons and walls) still plays its cast:
   its animation is R3 visual state, its effect stays the server's.
2. **Effect: the server decides, and relays only what every game may run.**
   Unchanged: the cast is R1 at the server, the numbers are the server's
   (ADR-028), the relayed SpellCast gives the figure its look
   (castSpellImmediate, ending in FinishCast), and the server withholds the
   relay where a spell's effect must not run in another game.
3. **The sender reports what the engine did, never a guess**: the hand is
   the hand whose action performed the cast (the hook's event name); a
   shout is reported at its release, every exhale armed; the client sends
   only the player's own casts and its hosted actors'.
4. **Melee stays on the event relay** (attackStart and kin: the server's
   AnimationSystem reads them for stamina, bash and stagger); the voice's
   actions too for now (shoutStart works). Moving either is its own verb,
   measured the same way.

**Consequences.**
- One shape for every cast a figure shows, hands and dual included, and
  the same shape for every magic verb after it (Ghostwalk, Apocalypse's
  summons and walls): the figure plays the action, the server decides the
  spell.
- The measured rule the view keeps: a cast's start sent in the same tick as
  its variables is refused every time; one update later it is taken
  (x-figure-action 20261015-055039 and kin). No engine path cancels a
  foreign want variable (the re-analyst, 2026-10-14); the latency is the
  graph's.
- Dead with it: m2-hands' held start, m2-firebolt, m2-hands-exit,
  m2-breath, the SkympFakeEquip rewrite of the hands' Equipped events.
- The parity gate reads casts on figures (p-spell-bolt, ADR-031), so a
  start the figure refuses or an exit it never takes fails a sweep, not a
  playtest.

## ADR-033: A verb is proved over its sequences and combinations, and a playtest is recorded

Status: accepted (2026-10-15, Eli: "we ARE closer so i think something abt
the method is working. but think about what abt the method needs to change
because for the next legs we want to be as wholistic", then "write it up as
the ADR"). Amends ADR-031 (the inventory and the parity check), ADR-030 (what
the gate runs) and docs/VERB.md (the template and the reviewer's checklist).

**Context.** The cast-action verb (ADR-032) shipped with the method as it
stood: the engine's shape read on sky-re, four probes proving each
capability once, the inventory of one cast's consequences, b-spell and the
first parity scenario green, a gate of six, a merge. Playtest nineteen then
found "every test only half works": the figure took every other cast
(c2's log, 10:38 to 10:41; x-cast-twice-fast 20261015-180119 reproduced it:
casts two, four and six of eight refused whole), both hands casting the same
spell separately streamed from one hand, and the breath was as before. None
of it was a wrong read of the engine. Every failure lived in a dimension the
method had not asked about:
- repetition: the probes and the scenario cast once, or four seconds
  apart; a person casts again 400 to 700 ms after the last exit, where the
  exit's variables had left the figure's want variable up (no rise for the
  graph) and the graph was still finishing its exit (the caster's engine
  waits for the graph's answer; the view performed one update later
  regardless);
- combination: the hand fix of the night before named every cast event
  with the latest start's hand, right for one hand and wrong for two hands
  casting separately, a case no probe ran; and "dual casting" meant two
  things to Eli (both hands separately, the perk's combined cast) and one
  to the verb;
- context: the lab's caster stood still with nobody casting back; the
  strafing probe (175846) was the first to refuse a start in the lab;
- measurement: the reading came from Eli's notes and one game's log, the
  other game's log having stopped silently at the restore, with no watch
  on either seat;
- the gate: the parity diff compares which events a figure took, not how
  many, so three starts of five taken is the same key set as five.

**Decision.**
1. **The inventory has a second table: sequences and combinations.** Beside
   the action's consequences (ADR-031), a verb's doc lists how the action
   repeats and combines: the same action again at a person's rhythm (the
   next within a second of the last), the action from each input that
   performs it (each hand, both hands separately, the perk's dual cast,
   the voice; sneaking, moving, on a mount where it applies), the action
   interrupted (a cancelled charge, a sheathe mid-cast, a stagger during
   it), both players doing it at each other, and the action after a login
   or a cell change. Each row is a probe or a scenario, and a verb is not
   done until every row has one green.
2. **Scenarios do what the checklist asks, the way a person does it.** For
   every item of a playtest checklist there is a scenario that performs it
   as the item says: "a few times" is a few times, at a human rhythm with
   jittered gaps, moving when a person would move, from both seats when
   the item says both. The gate runs them before the playtest; the
   playtest then measures what the lab cannot (feel, latency to the eye,
   the look of a thing), not whether it works.
3. **A playtest is recorded.** The driver runs in the players' games, so
   the recorder (ADR-031's watch) runs on both seats for the whole
   playtest, cycled every few minutes, its traces saved to the results
   site like a run's; the server's log and both games' logs are fetched
   at the end. The reading of a playtest starts from its traces, and Eli's
   notes say what the traces cannot. A game whose log stops is itself a
   finding.
4. **The parity diff counts.** After the cut, each event, cast, hit and
   effect key carries its count, and a count below the reference's is a
   finding ("missing n of m") as a missing key is; the later list may name
   a count difference as it names a key.
5. **A measured constant carries its conditions, and the engine's
   mechanism beats it.** A rule read off a measurement (one update between
   the variables and the action) is written with the state it was
   measured in (a settled graph) and gets a probe at its boundary before
   it ships; where the engine has a handshake for the same thing (the
   caster's wait for the graph's answer), the verb uses the handshake, not
   the constant. A fix to a rule over hands, actors or seats enumerates
   the combinations in its probe list before it merges (ADR-032's hand
   rule regressed the one it did not probe).

**Consequences.**
- docs/VERB.md gains the second inventory table and, in the reviewer's
  checklist, "every checklist item has its scenario" and "the sequence
  rows are green".
- The lab: the recorder's cycling during a playtest (`just
  playtest-record`), a driver step that repeats an action at a jittered
  rhythm, parity's counts (labapi parity.py), and a `scenario per
  checklist item` check the gate can read. numidium's tooling, in that
  order; the counts first, since p-spell-bolt runs today.
- cast-action is the first verb reworked this way: its sequence table
  (quick casts, both hands separately, strafing, both seats, a cancelled
  charge), x-cast-twice-fast and x-both-hands-relay as scenarios in the
  gate, the retry replaced by the graph's answer, nineteen played again
  with the recorder on.
- The cost: a verb's lab time grows by its sequence rows, an hour or two,
  against a playtest found wanting and a day of re-staging; that is the
  trade this ADR makes.

## ADR-034: An engine moment comes from SKSE's event where SKSE publishes one

Status: accepted (2026-10-15 night, Eli: "i would imagine hooking SKSE is
gonna be the lazy answer for a LOT of these things"). Refines ADR-005 (the
engine map) and the design law's first line.

**Context.** The cast-action handshake needed the moment a figure's graph
answers a cast request (BeginCastRight and kin). Three builds reached for it:
a Frida interceptor on the handler (34bdf0c3) crashed the game at the first
answer; a vtable swap on the handler's slot (5df863fd) never fired, because
skse64 writes its own function into that slot for its action events and
overwrites any plugin's (slot-probe.js, 2026-10-16 01:40Z); a sink on
SKSE::ActionEvent (a930968b) took 49 of 49 starts 1 to 2 ms after the
answer. SKSE already hooks the engine at the points we keep reaching for and
CommonLibSSE-NG hands them to a plugin as event sources (include/SKSE/Events.h:
action events per actor for weapon swing, spell cast and fire per hand,
voice cast and fire, bow draw and release, draw and sheathe begin and end;
camera, crosshair, mod callback and NiNode update events; API.h:28-33).

**Decision.** When the fork needs the moment an engine action happens, it
takes SKSE's event for it if SKSE publishes one, through a BSTEventSink on
the CommonLib source, filtered in native, before it writes a hook of its own.
Our own hooks (Frida interceptors or vtable swaps) are for data SKSE does not
publish: the action's idle and variables (the PerformAction hook), a
projectile's launch data, a native's result. A verb doc's engine surface
names which of the two each moment uses and why.

**Consequences.** The breath report moves to SKSE's voice fire with the
shout as its source form (the hit-based report under god mode is the open
row of playtest nineteen); the cast's hand can come from spell fire per slot
instead of the pending-start bookkeeping in the PerformAction hook; a
figure's draw state can come from the draw and sheathe events. Each is a
measured change, not a rewrite: the row's probe first. Writing into a slot
SKSE owns is a known failure now, not a mystery: a swap that never fires
is checked against the slot's owner (slot-probe.js) before anything else.

