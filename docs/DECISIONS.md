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
blockPapyrusEventsService.ts). [Erratum 2026-10-19, ADR-044: OnUpdate is blanked too; the hook consults its allow list for every event but OnUpdate and blanks whatever it did not clear (docs/research/papyrus-event-filter.md).] Apocalypse 10.2.3 is 206 scripts, 162 of
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
gonna be the lazy answer for a LOT of these things", and when asked whether
that was a decision, "id call it largely a decision"). Refines ADR-005 (the
engine map) and the design law's first line.

**Context.** The cast-action handshake needed the moment a figure's graph
answers a cast request (BeginCastRight and kin). Three builds reached for it:
a Frida interceptor on the handler (34bdf0c3) crashed the game at the first
answer; a vtable swap on the handler's slot (5df863fd) never fired: skse64 holds
its own function in that slot for its action events, so a plugin's write
is not in the chain (slot-probe.js, 2026-10-16 01:40Z, read while the
swap was installed; the order of the two writes was not measured); a sink on
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


## ADR-035: A cell's own NPCs, hosted by one player's game per cell

Status: ACCEPTED 2026-10-18 (Eli, docs/private/decisions-m3.md, all three
boxes: the cell's own NPCs, TES3MP's way; a grace window of about 5 s and
no takeover by ping; the whole as proposed). Proposed 2026-10-16 night,
drafted from the M3 research of that night, docs/research/m3/:
skymp-hosting.md, tes3mp.md, te-npcs.md, re-ai-puppet.md. Amends ADR-012's
reserved cell-host family; retires SkyMP's actor-level host model for the
cells it covers.

**Context.** M3 (docs/PLAN.md) hosts the world by cell, TES3MP's way: one
player's game runs a cell's NPCs under their packages, every other game
shows them, the server decides what an NPC does to anyone and keeps what
it is. SkyMP does something else today (fork parity ef44a1d8):
- It hosts one actor at a time, not a cell: a client asks for an NPC about
  1.5 s after it shows unhosted, and anyone may take it once its reports
  are 2 s old (skymp5-client view/formView.ts:429-496;
  ActionListener.cpp:1958-2051). A disconnect releases nothing
  (PartOne.cpp:558-582), and the night of 2026-10-16 the host path aborted
  the server (fixed on ef44a1d8, unit/HostAttemptTest.cpp).
- It does not run the game's own NPCs. Every client deletes each engine
  actor within 8192 units the server did not make (worldCleanerService.ts:
  37-108) and shows each server NPC as a PlaceAtMe copy of its base
  (formView.ts:145-305; "all skymp npcs are FF+", hitService.ts:21). A copy
  loses what a schedule leans on: linked references, quest aliases, the
  editor location, the reference's scripts (untested; to read in the lab).
- Its loader drops the NPCs M3's exits need: essential, protected and
  unique ones, crime-faction members, every playable race
  (WorldState.cpp:459-585), so Riverwood's residents and every humanoid
  bandit; and the lab server never sets npcEnabled.
- Its handoff signal cannot reach a master-file NPC: the hosted-by-other
  flag rides a property update whose id is 32 bits (wire-schema
  skymp.rs:426), and the relay echoes a host's own reports back to it
  (ActionListener.cpp:108-118).
TES3MP runs the engine's own actors. Each cell has one authority, the first
player to load it; on leave it passes to the remaining visitor with the
lowest ping (CoreScripts 0.8.1 scripts/logicHandler.lua:869-932). Only the
authority's packets about its actors are accepted. Every client starts with
the engine's AI off and turns it on only for actors in the cells it hosts,
so the rest are displays of what the server relays (TES3MP 0.8.1
apps/openmw/mwmechanics/actors.cpp:2172-2248, apps/openmw/mwmp/
DedicatedActor.cpp:56-162). A handoff sends the saved state first, then the
grant, then the new authority's full update (logicHandler.lua:871-894; the
0.8.0 changelog's late-grant desync fix). Skyrim Together, read as a map
only (ADR-005, docs/TE-MAP.md), leaves AI running on every copy it does not
own and blocks each output instead: actions, movement, transforms, equips,
casts. Its open bugs are that leftover state breaking NPCs at a handoff
(issue 810), duplicates from a stale echo (906), and owners fighting over
an NPC, fixed with an epoch on every grant (pull request 887). The wire
already reserves this milestone's messages, defined and validated, with no
sender: HostGrant {cell}, HostRelease {cell} and HostedActorState
(wire-schema lib.rs:224-240 and 293-301; docs/WIRE.md:172-175).

**Decision** (accepted 2026-10-18).
1. A cell's NPCs are its own actors. In a cell the server hosts, a client
   keeps the engine's references from the master files and the server knows
   each by its own form id; the world cleaner stops deleting them, and the
   PlaceAtMe copy stays only for actors the server makes (other players'
   figures, server spawns).
2. The unit is the cell, an interior or one exterior grid cell. The server
   grants it to the first player whose game attaches it (Skyrim Platform's
   cellAttach and cellFullyLoaded events, ADR-034's event first). When the
   host leaves the cell or disconnects, the server waits a grace window
   of about 5 s (a player stepping out and back keeps the cell), then
   grants it to the remaining visitor with the lowest round trip. No
   takeover by ping (TES3MP's 40 ms margin is not taken): a host changes
   only when it leaves, so hosts never churn. Eli's choice, 2026-10-18.
3. Every grant carries an epoch, a fencing token (Kleppmann, "How to do
   distributed locking", 2016; Burrows, "The Chubby lock service", OSDI
   2006). Every host message carries it, and the server drops a message
   from an older epoch. This adds a field to the reserved HostGrant and
   HostedActorState, with its validator (rule 4).
4. Off the host, the cell's NPCs are puppets: their AI is off and they
   show the host's stream. The engine has no single switch for that (the
   re-analyst on sky-re, 2026-10-16, 1.6.1170,
   docs/research/m3/re-ai-puppet.md). Actor::EnableAI(false), ID 37504, clears
   the actor's kProcessMe bit, which stops its packages, combat behavior,
   detection requests and chatter, but also drops it from the animation
   pass, so it would freeze in pose; hits, staggers, PerformAction and
   SetPosition do not read the bit. The candidate set is EnableAI(false),
   the puppet put back into the animation pass (the engine's own animation
   job queued for it), the engine's movement step skipped for it, as
   Skyrim Together skips its remotes' (a lead only), and combat stopped on
   demotion and on a combat event. A lab probe, x-npc-puppet, decides it
   against Skyrim Together's other shape, AI on with each output blocked,
   which leaks wherever a block is missing. Measured 2026-10-17 on the
   engine alone (x-npc-puppet 20261017-082859, docs/research/m3/
   readings-2026-10-17.md): AI off froze the bandit at rest; a hit's
   stagger was taken but not played; the movement step slid it away from
   the push; it went into combat with AI off. So the whole set is needed.
   The puppet with the animation pass put back is the next probe.
5. On the host, the engine runs the NPCs under their packages, and the host
   reports what they do as R2 records, bounded where cheap (R1: the
   movement budget players have). Movement rides the existing movement
   relay; actions ride cast-action's action replay (ADR-032), extended from
   players' figures to NPCs; health, equipment and inventory ride
   HostedActorState. Per-tick state goes on an unreliable channel with the
   epoch; grants and full updates go reliable and ordered (renet,
   ADR-011), since one ordered channel for 25 ms positions stalls behind a
   lost packet (TES3MP's ActorPacket.cpp:11-13; RFC 9000 section 13).
6. The server decides what an NPC does to anyone and what it is (R0):
   hits on and by NPCs under the rules players have (reach, cone, the
   server's numbers), deaths that persist (not SkyMP's 25 s respawn at the
   editor location, MpActor.cpp:1893-1975), inventories, and spawns. A
   client proposes a spawn and deletes its own copy; the server assigns the
   id and sends it to everyone; a leveled list is rolled once per cell, by
   the server (TES3MP's ProcessorObjectSpawn.hpp:21-26).
7. A handoff runs in TES3MP's order: the server sends the cell's recorded
   state, then the grant with a new epoch; the new host turns its puppets
   live from its own copies and sends a full HostedActorState for each;
   the old host gets HostRelease and turns its actors to puppets. In the
   engine (the same read, its order a HYPOTHESIS): going live is
   SetPosition to the recorded point, AI on, the package evaluated at once
   (CommonLib's EvaluatePackage(true, false), which runs the package check
   then and not at the next AI tick), then StartCombat on the recorded
   target, since an evaluation that resets also stops combat. Going puppet
   is combat and alarm stopped, StopMoving, the keep-offset cleared, then
   AI off, the actor kept in high process.
8. A cell nobody is in freezes at its last recorded state; the server
   simulates nothing there (as today). The next attach runs point 7.
9. The loader brings in the NPCs a schedule needs, the essential, unique
   and humanoid ones its filters drop today, behind npcEnabled, first on a
   probe-only lab setting.

**Consequences.** M3's first verbs follow the points: cell-host (2, 3),
npc-puppet (4), npc-stream (5), npc-handoff (7), npc-fate (6: hits,
deaths, spawns). Each starts with ADR-031's references of the engine alone:
an NPC under its packages, a fight with bandits, a cell entered and left,
recorded before any code. SkyMP's actor-level host path (OnHostAttempt,
hosters, the 2 s lapse), the world cleaner's deletion of master-file NPCs
and the copies for them are retired in hosted cells, and the echo of a
host's own reports stops. The risk to measure first is Skyrim Together's:
state a puppet keeps that breaks it when it goes live; x-npc-puppet and the
handoff reference read it before any handoff code. The model is the
general one for a replicated world, one primary copy per object migrated
between machines (Bharambe, Pang and Seshan, "Colyseus", NSDI 2006).

## ADR-037: A figure's explosion applies no number to a player (ADR-028 extended)

Status: ACCEPTED 2026-10-18 (Eli's tick in docs/private/decisions-m2-apocalypse.md,
question 5, re-asked). PROPOSED 2026-10-17 from the class pass's
target-location spells. His first answer, "not yet, friendly fire is fine
for now", answered whether the server's number lands on a friend (it does,
gates or not) rather than who applies it; re-asked as how many times the
standing player takes a figure's explosion (once, from the server, with the
gates; twice without, their own game's copy accepted by OnChangeValues as a
plain drop), he took the gates. They ride fork train m2-train-26
(f2f26ec3, m2-explosion-gate a42d5512 merged), behind the headshots layer;
their probe is x-explosion-gate, run ungated on train-25's stage first.
That run (20261018-140111) measured nothing: both runes fizzled because the
lab's look step does not pitch the first-person view, so the casts found no
ground point within range (docs/research/apocalypse/target-location.md,
the lab's aim). The gates' evidence comes from the big playtest by eye
(twenty-three's Frost Rune item) and from the probe once the driver can aim
down; the gates ride train-26 regardless, the rule being ADR-028's.

Context. ADR-028 made the server the only source of a player's Health,
Magicka and Stamina changes from another player's magic: in each game, a
figure's spell-type effects that modify those values are refused at
AddTarget (Skyrim Platform Hooks.cpp), and the server's number arrives
instead. The class pass makes figures place target-location explosions in
other games (docs/research/apocalypse/target-location.md, fork
m2-area-effect): the explosion appears where the caster aimed, owned by
the figure. The re-analyst's read of the explosion's own pass (43847,
43849 on 1.6.1170) found two number paths that bypass the AddTarget
refusal: the EXPL record's DATA damage, dealt through Actor::DamageActor
(37335) with no AddTarget at all, and the EXPL's enchantment, cast by the
owner's instant caster as an EnchantmentItem, whose spell type the refusal
does not list. So a figure-owned explosion would hurt the observer's own
player locally, beside the server's number for the same cast.

Decision (proposed). ADR-028's rule covers an explosion as it covers a
spell: in a game, an explosion owned by a figure applies no Health,
Magicka or Stamina change to that game's player. Two gates, both in Skyrim
Platform, both filtered in native (rule 9):
1. The AddTarget refusal takes an EnchantmentItem whose caster is a figure
   as it takes a spell (the refusal's IsCast widened to kEnchantment and
   kStaffEnchantment when the caster is not the player).
2. Health damage to the player from a figure is refused where the engine
   hands it to the actor: PlayerCharacter's Actor::HandleHealthDamage
   (CommonLibSSE-NG include/RE/A/Actor.h:458, vfunc 0x104, taking the
   attacker and the damage), overridden on the player's vtable the way the
   AddTarget refusal is (Hooks.cpp), returning without the call when the
   attacker is a figure. This covers the explosion's damage (its attacker
   is the owner, the figure) and every other engine path that reaches the
   player's health with a figure as attacker; the server's own numbers
   arrive as value changes, not through it. HYPOTHESIS until the lab: that
   this virtual is where the number is applied, not a notification after it
   (Skyrim Together gates the same chain one call earlier, at 37335,
   docs/TE-MAP.md; that is the fallback, a Frida hook on it).
Everything else the explosion does to the player stays native: knockdown,
impulse, image space, camera shake, sounds, the placed object. The
server's number for the cast arrives as today (the spell's effects through
the claimed hit; for an explosion-only spell the server applies the
spell's area effects to the targets the caster's game reports, as a Self
burst's).

Consequences. The observer feels an Apocalypse explosion (knockdown and
look) and loses exactly the server's number, once. Gate 1 also refuses a
figure's weapon enchantment's Health, Magicka and Stamina effects in the
victim's game (an EnchantmentItem cast by a figure), which the server does
not compute yet: an enchanted weapon's extra number is lost between
players until enchantments become a server number (M5), where today it
landed unvalidated. Gate 2 changes nothing for melee and arrows, whose
figure damage is already zero (attackDamageMult 0). Without this, two
numbers land. A figure's explosion that should hurt its own caster (none in
the census) is unaffected: the caster is not the player in that game.

Measured in the records (2026-10-18, lab/esm.py on sky-srv, every EXPL of
the three plugins): of Apocalypse's 87 explosions, 3 carry damage (1 or 2,
flat: Detonate Lock's, Skull Trap's, Frozen Orb's end) and none an
enchantment; Lightning Strike's and Thrumming Stone's carry neither, so
the class pass's placed explosions never carried a number of their own.
Lost Grimoire: 10 of 54, five with enchantments (Firebomb, Shattering
Crystal, Flameheart's end, Detonate Minion, Supercharge Minion; Kinetic
Rune's is Skyrim.esm's EnchStagger 0x72674, no number). Skyrim.esm: 59 of
143, among the player's spells Fireball's impact explosion (damage 2), the
fire and shock rune explosions (damage 2) and the frost rune explosion
0x44089, whose enchantment SlowFrostRune 0xb72a2 carries
HazardFrostDamageFFContact 40 and FrostSlowFFContact 50 for 5 s: gate 1's
case, 40 Health and Stamina from the standing player's own game before
the gate. So the double count is small for the Apocalypse placers and real
for the vanilla runes and the five Lost Grimoire explosions.

A consequence to carry: a number that lives in an explosion's enchantment
reaches the server through nothing today. The caster's game reports the
trigger as a hit of the enchantment, which is no spell the caster cast, so
the server refuses it (HYPOTHESIS until x-explosion-gate's before run on
train-25), and with gate 1 the standing player's game applies nothing
either: vanilla Frost Rune and those five Lost Grimoire spells do nothing
to another player until second-hand's reach (docs/verbs/second-hand.md)
follows a hazard to its explosion and the explosion to its enchantment.
That is the right order: the server's number, validated, instead of the
client's, unvalidated, which is what landed before.

Alternatives. (a) Never place a figure's explosion: the observer sees
nothing, as today. (b) Place it with no owner (a NonActorMagicCaster): the
enchantment path then has no actor caster and the refusal cannot tell it
from a trap's; the damage path still runs. (c) Strip the EXPL's damage and
enchantment from the records on the clients: a mod edit per spell, against
the law.

## ADR-038: Marksman consequences the shooter's game plays at once, the server confirms

Status: ACCEPTED 2026-10-18 (Eli, after playtest twenty-three: "headshots
are an instance where the timeliness of it matters. id say whatever design
makes it as seamless as possible. for a lot of stuff server authority wins
out, but for marksman combat, some elements at least, the feel is more
important").

**Context.** The headshot kill (docs/verbs/headshot.md) is the server's
(R0): the shooter's game reports the bow hit, the server claims the headshot
(head bare by worn armour, race, archery 60) and kills, and every game plays
the death from the record. Playtest twenty-three measured it (results/
playtest-23, server.log): eight kills, none refused, 27 to 50 ms from the
arrow's landing to the kill on the server, 168 to 316 ms from the release.
Eli: "it WORKS but there's a little bit of a lag. it feels less organic than
in the game." In Skyrim itself the kill is Headshot Kills' own, in the
shooter's game, in the hit's frame.

**Decision.** For a marksman consequence whose feel depends on its moment,
the headshot kill first, the shooter's game plays the consequence at once
from the same rule the server applies (the mod's own kill attempt on the
figure is the trigger: its kill spell applying to the figure), and the
server stays the authority over the state: it validates the report as
today and confirms (the kill record, the death to every game) or refuses,
and a refusal reverts the prediction (the figure stands back up, the revert
logged and counted in the lab). The state keeps its rung (R0); the
prediction is R3 visual state until the confirmation lands. Each further
marksman element takes this shape by its own verb doc, case by case; it is
not a general licence to predict.

**Consequences.** headshot.md gains the predicted kill and its revert; the
lab measures both (a bare head predicted and confirmed; a helmeted or
under-skill shot the shooter's game predicts wrongly must revert within the
round trip); the parity scenario compares the shooter's view against the
engine alone's timing. ADR-028 (the server's numbers alone) stands: the
prediction changes no value, only the moment the death is seen.

## ADR-039: The server evaluates an effect's conditions; unknown functions refuse and log

Status: ACCEPTED 2026-10-18 (Eli: the morning's decision that the server
evaluates conditions because it owns the state, docs/private/
decisions-m2-apocalypse.md section 4; and that evening, on the policy for a
function the server cannot evaluate yet: "refuse and log").

**Context.** The server applies a spell's effects to another player from the
caster's hit report without reading the effects' conditions (CTDA), except
HasPerk (fork 93358eea); its condition evaluator has 17 functions and two
callers (docs/research/apocalypse/effect-conditions.md). Playtest
twenty-three: Azure Reconstruction, whose effect heals only a summoned
creature, healed player two through the server (23 ticks at a quarter of
its magnitude) while the caster's own engine refused it on its conditions
and printed "Prisoner resisted azure reconstruction". Apocalypse's class
spells lean on conditions throughout; vampirism and the rest of the race
state are undeclared on the server (M5).

**Decision.** Before applying an effect from one player to another, the
server evaluates the effect's conditions against its own record (the
Subject and Target reading measured first, HYPOTHESIS until then). A
condition function the server implements decides as the engine would; an
effect aimed at another player that carries a function the server cannot
evaluate is REFUSED and LOGGED (one warning naming the function, the spell
and the effect), so each gap surfaces in the lab and the playtests instead
of as a silent false positive. Self effects stay the caster's game's
(ADR-029's default) and are not evaluated here. The implemented set grows by
the census's ranking of functions on effects aimed at others (apocrypha's
read), the first being the ones Azure Reconstruction and Nature's Balance
need.

**Consequences.** The effect-conditions verb rides train-27 with a T0 oracle
per function (the engine's documented semantics, CK wiki, UESP), its T3
claim Azure refused on a player and accepted on a summon once summons
exist; the server log gains E_CONDITION_UNKNOWN; a refused heal or harm is a
finding, not a bug, until its function is built.

## ADR-040: A playtest runs on the stage; the loop from findings to seats is three hours

Status: ACCEPTED 2026-10-19 01:3x PDT (Eli: "accept 40 for sure"); proposed
2026-10-19 00:1x PDT (Eli: "yes please draft those process changes. all day
for 1 playtest is rough and seems to be increasing in time. ideally we'd have
2 or 3 a day"; drafted from the night of train-27); item 1 in effect from
2026-10-19 00:17 by Eli's choice of the day's plan ("lets go with your 2
playtest suggestion": twenty-four on the staged train-27 in the morning,
twenty-five on the essentials layer and train-28 in the evening); the tooling
items under way on his "fire at will" to numidium. Amends
ADR-030 (the gate's selection for a train) and the stage's shape in
docs/LAB.md; leaves ADR-024, ADR-027 and ADR-033 as they are.

**Context.** One playtest a day, and the day is lengthening. Playtest
twenty-three ran 17:30 to 18:55 PDT on 2026-10-18 on a build merged at 14:05
(seats ready at 14:10); its findings became train-27 (six rows). The train's
first stage (rows 1 and 2, 2b4d5b27) reached the lab at 20:18 and read its
probes by 20:31, T2 by 20:55; the second (rows 3 to 6, c32cf0bd, after three
red heads) reached it at 23:37 and read its last probe at 23:59; the gate and
merge are a morning job, so playtest twenty-four is the next evening at the
earliest: about 24 hours from findings to seats.
Where the hours went, measured on the night:

| step | cost on 2026-10-18 | what it bought |
| --- | --- | --- |
| building the six rows (Rust, C++, TS, tests, docs) | about two hours | the fixes |
| three red heads in the C++ CI (dd1b5483: four new unit tests that had never run; 43675022 and 44e959e9: compile errors), the server building and testing only in CI | server-build named each 7 to 8 min after its push; 21:30 to 23:01 from the first red push to the green one, the fixes included | nothing |
| the Windows client build, GitHub's hosted runner building from scratch, waited on by every stage | 35 to 36 min a head (runs 39191168626 at 2b4d5b27, 39207598638 at c32cf0bd); the stages waited 35.6 and 27.5 min of it | the client: every staged head changed it (skymp5-client, or the wire crates wire-client-ffi links: wire-schema, wire-json, wire-validate) |
| a stage: the deploy, both clients and the snapshots, then the probes | 9 to 9.5 min to lay, about 2.2 min a probe; stage 2 (six probes) 50 min from verb-stage's start, 27.5 of them on the Windows build | the four green rows, two bugs of mine, two probe faults |
| T2 after the stage's probes | 23.6 min a stage (20:31 to 20:55) | the wire's differential oracle |
| a probe fault (a cast hold too short, an unmeasured pitch) | one lab cycle each | the probe |
| the gate sweep, ADR-030's selection | train-23 12 runs; train-24 23 runs in 51 min; train-26 27 scenarios and 2 reruns in 75 min (12:50 to 14:05) | a regression net the nightly also casts |
| playtest setup from the checklist's Setup section | scripted while the gate ran (one clarification round), then 1 min 40 s of setup: seats ready 4 min after the merge (14:06 to 14:10) | the seats |

The checks themselves earned their keep: the T0 set caught a regression that
would have failed the cloak row in Eli's hands (a vanilla effect gating on a
condition function the server did not know, docs/research/apocalypse/
effect-conditions.md), and the stage caught a validator refusing the first
actor's snap. What is slow is latency and serial shape, not coverage: the
first stage of a train waits half an hour on a client build made from scratch,
the gate grew from ten runs to twenty-three because a train touches
ActionListener.cpp and ADR-030's "every verb whose files the branch touched"
then names most verbs, the playtest waits for the gate and the merge it does
not need, and a compile error costs a pipeline. Keeping a fast commit stage
in front of slower acceptance stages, and shortening lead time rather than
cutting checks, is the standard shape of this problem (Humble and Farley,
Continuous Delivery, ch. 5; Forsgren, Humble and Kim, Accelerate, 2018,
where lead time and change failure rate improve together, not one for the
other).

**Decision.**
1. **The playtest runs on the stage.** A train is staged (its build deployed,
   the staged client on the live clones, its probes read) and goes to Eli's
   seats from there: `playtest-restore` relaunches the live clones, so the
   playtest needs no snapshot and nothing is promoted at the stage; clean-m1
   stays parity's client, the base every other stage and the nightly stack
   on, promoted at the merge as now. The gate sweep and the merge to parity
   follow the playtest, when the lab is free again (feedback: a reported
   checklist frees the seats), or at night. ADR-033's record of the playtest
   is evidence for the train's rows either way; a gate red after a playtest
   does not undo the findings, it holds the merge. Parity therefore lags the
   seats by one train; LOG.md names which build each playtest ran on, as it
   does today.
2. **The gate for a train is its own rows.** ADR-030's always set
   (`smoke-two-players`, `a-restart-persistence`), the scenarios of the
   train's rows, and every open ADR-027 watch item: target eight runs,
   about twenty minutes. The "every verb whose files the branch touched"
   expansion moves to the nightly sweep, which runs every scenario anyway.
   A single verb's merge keeps ADR-030's selection as written.
3. **The client build gets faster; a stage reuses one it does not need.**
   The Windows build is 35 to 36 minutes from scratch and every head of the
   night needed it (the client FFI links wire-schema, wire-json,
   wire-validate and wire-transport, so a wire change is a client change).
   So the lever is the build itself: measure its steps from a run's timings
   (vcpkg restore, CMake and C++, cargo, the TypeScript bundle) and cache
   what repeats (vcpkg binary caching and cargo's target through
   actions/cache, or a warm self-hosted Windows builder), aiming under
   fifteen minutes. The trivial case stays: `verb-stage` and `build-client`
   reuse the last successful run's dist when nothing the client links
   changed since its commit, naming the run they took. Since 2026-10-19 the
   build has two sources, read together by lab/tools/client-builds.py: the
   fork's own client-build job on sky-build (VM 720, the GitLab Windows
   runner, warm vcpkg and cargo caches on its disk) and the mirror's run;
   a commit both built is taken from GitLab, and the head's wait ends at
   whichever source goes green first. The job runs on a push that carries
   `CLIENT_BUILD_WINDOWS=1` (the push option) until the project variable is
   set, after its first green run.
4. **A fast T0 oracle.** Of the night's three red heads one was tests that
   had never run and two were compile errors, so the oracle must build and
   run T0, not compile alone. Its cheapest form is the fork's own
   server-build made incremental: a BuildKit cache mount for the CMake build
   directory in the build stage, so a few changed files rebuild and test in
   minutes and the push stays the one oracle, with no new tool. Failing that,
   a kept build directory on sky-ci behind `just t0 <branch>`.
5. **A probe reruns alone; T2 runs beside the probes.** When only a probe's
   YAML changed, it reruns on the current stage through lab-api (`just
   lab-run <path>`, as the night's headshot reruns did); a re-stage is for a
   new head. T2's servers are their own containers, so T2 runs on sky-srv
   while the probes run on the clones (23.6 minutes after the stage tonight),
   once a stage has shown sky-srv's load leaves the probe timings alone.
6. **A playtest is set up by one command.** `just playtest-setup <n>` reads a
   profile (lab/playtests/<n>.yaml: the world to restore, each seat's spells,
   items and values, the hold's length) and does the restore, the relaunch,
   the server-side setup through labCommand, the Moonlight check and the
   hold; the checklist's Setup section becomes that file. Setup stays
   server-side (feedback 2026-10-13), never typed into a seat.
7. **A train is cut when its fixes are ready, not when every finding is.**
   A row that needs a probe iteration or a measurement (the rune's pitch)
   moves to the next train instead of holding the stage; a verb still ships
   whole (rule 3), on whichever train carries it.
8. **Measured.** LOG.md's train entry records findings-in to seats-ready in
   hours (tonight: findings at 18:55, stage 2's last probe at 23:59, five
   hours, of which the red heads were 1.5, the Windows waits 1.0 and T2 0.4
   a stage). The target is three hours, two to three playtests a day when
   Eli has the time. Reviewed after ten trains or at M3's start, whichever
   is first.

**Consequences.** Eli plays a build parity has not taken yet, so a train can
be withdrawn after a playtest and its findings still stand; the nightly
sweep, not the gate, is the cross-verb regression net, which is where
ADR-030 already put it, with ADR-027's two-sweep rule tolerating a lone red.
Items 3 to 6 are tooling for numidium, in this order: the T0 oracle (4),
item 1 alongside (policy, no tooling), T2 beside the probes (5), the client
build's speed (3), the playtest profile (6), the gate's selection (2) last
since it mostly saves lab time once item 1 holds; until each exists, the
step it replaces is done by hand and the LOG says so. Landed the same night
(numidium, 2026-10-19 00:xx): the playtest profile (`just playtest-setup`,
`playtest-ready`, `playtest-profile-check`, branch playtest-setup); the dist
reuse for server-only heads (`REUSE_DIST=1` on verb-stage); T2 beside the
probes, measured at no cost (118 and 122 s per probe against 115 and 123 s
alone); the T0 oracle's first form (a BuildKit cache mount) measured at 399
against 476 s cold, the CMake tree rebuilding 245 objects on a one-line
change because the runner's working copy is shared across branches, so
ccache is the next step. The
time saved on 2026-10-18's shape: about 35 minutes per server-only stage
(none that night: every staged head changed the client side),
about forty minutes per gate, a pipeline per compile slip, twenty minutes
per playtest setup, and the gate and merge off the playtest's critical path,
which is the day itself.

## ADR-041: Turbo mode: a live session's immediate turnaround

Status: ACCEPTED 2026-10-19 01:4x PDT (Eli: "accept 41 and implement if it allows us to
ramp up development. i feel like we can be doing a lot of this quicker");
proposed 2026-10-19 (Eli: "taking a look at the overall process,
what's the fastest we could do this? just immediate turnaround?"). Extends
ADR-040 (branch adr040-cycle-time, proposed the same morning: the three-hour
loop and its tooling) and ADR-030 (the gate and the nightly stay the net);
leaves CLAUDE.md's rules 3, 4, 5, 12 and 13 as they are and says how. Fork
line numbers are at parity d5b05e89; the measurements and their sources are
in docs/research/process/turbo-mode.md.

**Context.** ADR-040's loop is findings to seats in three hours: the fixes
built, the fork's CI green, a stage (the Windows client build waited on, the
server switched, the dist laid into both clones, two snapshots, the probes),
T2 beside the probes, the playtest on the stage, the gate and the merge
after. The question here is a different one: Eli is at the seats, sees a
bug, and wants the fix in his hands before the session ends. What is the
physical floor for that, class by class, and what does today's shape add
above it?

The seats are the clones. Test 1 is sky-c1 (VM 711, profile 1, stream
48989) and test 2 is sky-c2 (VM 712, profile 2, stream 49989)
(lab/tools/playtest-relaunch.sh:11; lab/playtests/24.yaml:49-52;
docs/LAB.md:57-59). Everything that reaches them goes through three doors:
the server container on sky-srv, whose image tag is `SERVER_TAG` in
/srv/lab/.env (lab/deploy/sky-srv/docker-compose.yml:10; the switch is one
line, lab/tools/verb-stage.sh:157); files written into the clones' game
folders through the guest agent, small ones by its stdin and anything past a
few hundred KB zipped over the in-VLAN HTTP hop from sky-srv
(lab/tools/stage-client.sh:12-17 and :38-52;
lab/deploy/sky-client/README.md:37-40); and the mod layer
(lab/tools/client-mods.sh:10-21). A seat takes a change one of three ways.
After a server restart skymp5-client reconnects and logs in by itself
(skymp5-client/src/services/services/networkingService.ts:57-58 and :83-85;
lab-api relies on it, lab/labapi/labapi/runner.py:816-823), in about 40 s
(docs/LOG.md:37; lab/labapi/labapi/config.py:191-197); the world survives
because it is a bind mount the restart never touches
(docker-compose.yml:32), and a-restart-persistence is the proof of what it
keeps (lab/scenarios/a-restart-persistence.yaml:31-45). A relaunch of the
game is a median 31.5 s a step (ADR-036's measurement over 156 of 239 steps,
branch adr036-relaunch), bounded at five minutes
(lab/tools/playtest-relaunch.sh:35-36). And Skyrim Platform reloads its
plugins by itself: a watcher thread per plugin folder waits on last-write
changes (skyrim-platform/src/platform_se/skyrim_platform/DirectoryMonitor.cpp:10-16),
and the next tick that sees one clears the platform's state and re-evaluates
every plugin in every folder (SkyrimPlatform.cpp:113-129; the folders are
`Data/Platform/Plugins;Data/Platform/PluginsDev`, Settings.cpp:33-34). It is
always on; no setting gates it. What the clear drops is every event and hook
handler (EventsApi.cpp:82), which skymp5-client registers again at its start
(skymp5-client/src/services/services/skympClient.ts:82, sync/animation.ts:362);
what it keeps is documented as `storage` (docs/skyrim_platform/features.md:3-5),
but in this tree the storage proxy is created per plugin load (Sp3Api.cpp:136),
so skymp5-client would take its "no AuthGameData" branch (skympClient.ts:31-46)
and log in again. Whether it does, and how long a reload takes on a seat, is
unmeasured. The server has the same for the gamemode: a chokidar watcher on
the gamemode path with a one-second debounce re-requires gamemode.js on
change (skymp5-server/ts/index.ts:151-179), and the lab mounts lab/gamemode
read-only into the container (docker-compose.yml:36), rsynced by `just
deploy-srv` (justfile:255).

The two builds the loop waits on, measured from the runs and jobs themselves
(2026-10-11 to 10-19; the detail is in the research note):

| build | measured | notes |
| --- | --- | --- |
| the Windows client (Parity Windows Flatrim), 31 green runs in 29.7 h | 22:22 min best, 34:07 median, 36:08 max | MSBuild is 16 to 25 min of it and the spread is runner speed on the same inputs; `yarn build` 16 to 23 s; ctest 3 to 4 min; vcpkg's binary cache hit every run from one 398 MB entry of 2026-10-02; no ccache or sccache anywhere in the build; queue median 3 s, one 26 min outlier; a newer push on the branch cancels a running build (parity-windows.yml:27-29) |
| server-build (GitLab, sky-ci, one job at a time), 180 green jobs | 6 to 9 min for 153 of them, median 7:42 off parity | inside one job: the Rust toolchain 49 s, configure and ninja 342 s, ctest 57 s (T0 runs here); a parity push after a fast-forward merge is fully layer-cached, 11 s; the cache-mount trial saved about a minute (6:39 warm against 7:57 cold) and still rebuilt 216 objects for a one-line change |

And the lab's own steps: a stage lays in 9 to 9.5 min and a probe is about
2.2 min (ADR-040's table); T2 is 23 min (docs/LOG.md:1994, :2025); a gate
ran 23 runs in 51 min, 25 in 60, 27 in 73 (docs/LOG.md:2005-2006,
:2042-2044, :2088-2094); a run's client rollback is 63 to 90 s
(docs/LOG.md:1707, :1785); playtest setup is 2 min server side
(docs/LOG.md:2097-2105); a layer stage ran in 5 and in about 7 min
(docs/LOG.md:1287, :1722). Unmeasured: the server's start to listening
(bounded 90 to 120 s, lab/tools/playtest-world.sh:43, config.py:217), the
image pull on sky-srv, client-dist.sh end to end (bounded by its 20 min
task, lab/tools/client-dist.sh:18), a local `yarn build`.

A change is one of six classes by what it touches. Each has a floor (build
what changed, move it one hop, let the seat take it) and a path today:

| class | what moves | today, to both seats | with the mechanisms above | the floor |
| --- | --- | --- | --- | --- |
| (a) TypeScript client only (skymp5-client/src) | one file, skymp5-client.js, 1.6 MB with its source map | the whole Windows build for a 20 s webpack step, since `build-client` knows only the `dist` artifact (justfile:52-65), then client-dist and a relaunch: 25 to 45 min (the build measured, the lay estimated from the stage's 9 to 9.5) | `yarn build` (16 to 23 s in CI, local unmeasured), the file over the hop and into every game folder as client-driver.sh:36 lays lab-driver.js, a relaunch (31.5 s): about 2 min, estimated | under 1 min if the hot reload carries skymp5-client (unmeasured) |
| (b) server C++, Rust rules, gamemode | the server image; or gamemode.js alone | server-build 6 to 9 min with T0 inside, the tag switch and `compose pull && up -d` (the pull unmeasured, a VLAN hop), the 40 s reconnect: 8 to 11 min; gamemode.js alone: `deploy-srv` and the watcher's second, about 1 min, estimated | an incremental build on a kept tree (ADR-040 item 4): 3 to 5 min, estimated | ninja on a few objects, the link, push, pull, restart, reconnect: 2 to 3 min, estimated |
| (c) wire schema (wire-schema, wire-json, wire-validate, wire-transport, wire-codec, wire-client-ffi) | both ends: the image, and MpClientPlugin.dll, which the Windows build makes from cargo (skymp5-server/cpp/CMakeLists.txt:15-19; cmake/wire.cmake:21; skymp-wire/crates/wire-client-ffi/Cargo.toml:17-20); a stale seat fails closed, since the netcode protocol id carries SCHEMA_VERSION (skymp-wire/crates/wire-transport/src/lib.rs:186-190) and the validator refuses the Hello (wire-validate/src/lib.rs:23, :549) | the Windows and the server build in parallel, the dist laid, a relaunch: 25 to 45 min | the Windows build cached (ADR-040 item 3, aiming under 15): 15 to 20 min, estimated | cargo builds the crates in 28 s on the runner; a DLL-only lay would give (b)'s shape plus a relaunch, about 5 min, estimated; no tooling for it |
| (d) Skyrim Platform native (skyrim-platform/src) | SkyrimPlatform.dll and SkyrimPlatformImpl.dll inside the 179 MiB dist | the Windows build, client-dist, a relaunch: 25 to 45 min | a warm builder: the fork's `client-build` job on a Windows shell runner exists and has never run (skymp/.gitlab-ci.yml:151-182, gated on CLIENT_BUILD_WINDOWS); on a kept tree MSBuild rebuilds SP's objects only: 5 to 10 min, estimated | that build, the lay, a relaunch: about 5 min, estimated |
| (e) scenario or probe only | a YAML into lab-api | `just lab-run <path>`, 2 to 4 min when the lab is free | none needed | not a live class: a run rolls both seats back, and under a playtest hold it is refused (docs/LAB.md:384) |
| (f) mod layer (persist-mods, the load orders) | plugins into every game folder, the server's load order | layer-stage's steps 2 to 5 (lab/tools/layer-stage.sh:70-97): 5 to 7 min measured with the smoke included, for the Apocalypse layer's few hundred files, then the seats' relaunch; add-mods scales with the files, and the essentials layer moves 6,195 a clone, unmeasured | the same without the snapshots and the smoke: about 5 min, estimated | the same |

What today's shape adds above the floors is not the checks but their
placement and grain: a one-file change rides a half-hour build, the stage
snapshots and probes before anyone plays, and nothing pushes one file to a
seat. The lab already owns every primitive: the one-file copy
(client-driver.sh), the tag switch (verb-stage.sh:157), the hop
(stage-client.sh), the relaunch (playtest-relaunch.sh), the world's save and
restore (playtest-world.sh:25-45), the hold (docs/LAB.md:384). The shape the
literature gives this problem is a fast commit stage in front of slower
acceptance stages, never fewer checks (Fowler, "Continuous Integration",
martinfowler.com, 2024 revision; Humble and Farley, Continuous Delivery,
2010, ch. 5 and 10), with the evidence that lead time and change failure
rate move together rather than trading (Forsgren, Humble and Kim, Accelerate,
2018). Turbo mode is that commit stage cut to what the physics allow, with
the acceptance stages moved behind the session instead of removed.

**Decision** (proposed).
1. **When it applies.** Turbo mode is a state of the lab, not of a branch:
   Eli is at the seats under a playtest hold and asks for a fix now. It
   begins at the ask and ends when he reports the checklist (a reported
   checklist frees the seats), after which the normal loop takes what
   accumulated. A turbo push touches the server and the two seats and nothing
   else: no snapshot, no promotion, no run, no stream opened.
2. **What flows, and how.** Every path ends with both seats back on the
   server's online list, read as `_wait_online` reads it (runner.py:816-823).
   (a) TypeScript client: `yarn build` in the fork checkout's skymp5-client
   (its Skyrim Platform typings are the npm package @skyrim-platform/skyrim-platform
   in node_modules, skymp5-client/tsconfig.json:15, so no C++ configure is needed,
   only one `yarn install`); `just
   turbo-client` lays skymp5-client.js into every game folder of both clones
   the way client-driver.sh lays lab-driver.js, keeping the file it replaces;
   the seats relaunch. Once a lab measurement shows skymp5-client whole
   across a hot reload, the relaunch is dropped and the push is the write.
   (b) Server: the branch pushed, the fork's server-build the one wait (its
   ctest is T0 and stays: ADR-040's three red heads were compile errors and
   tests that had never run); `just turbo-srv <branch>-<sha8>` sets
   SERVER_TAG to that fixed tag (verb-stage.sh:157 sets the moving `<branch>`;
   the fork's server-build pushes both, `<ref-slug>-<sha8>` and `<ref-slug>`, so
   the fixed one names the build played) and runs `compose pull && up -d`, for
   skymp-server alone: that line also pulls and restarts lab-api, whose hold
   lives in its memory (a restart drops it, and verb-stage's step 6 takes it
   again), and a live session has no reason to restart it; the
   seats reconnect by themselves. A gamemode-only change is `just
   deploy-srv`; the watcher does the rest (index.ts:151-179). deploy-srv also
   writes the server's settings files, which the server reads only at its
   start, so a settings change is a server push with the restart, not the
   watcher's.
   (c) Wire schema: both ends in one commit (rule 4); the server as (b), the
   client as (d); the seats relaunch after both are in place, never between
   (a seat on the old client fails closed, correct and useless mid-session).
   (d) Skyrim Platform native: the Windows build waited on, `just
   build-client <branch> <sha>` and client-dist.sh on 712 then 711 as the
   stage does (verb-stage.sh:170-179), a relaunch, no snapshot.
   (e) Scenario or probe: does not flow during the session; it runs on the
   stage after.
   (f) Mod layer: layer-stage.sh's steps 2 to 5 (persist-mods, deploy-srv,
   the server restarted, client-mods on both clones) without 6 and 7, the
   world saved first (item 5).
3. **What never flows this way.** A database schema change (rule 6 wants a
   migration and a restart-persistence scenario, and a live world is not the
   place to find out); anything under lab/scenarios (rule 13 and the
   scenario-gate job, .gitlab-ci.yml:99-135, which refuses a commit mixing a
   scenario with other paths) or docs/DECISIONS.md (Eli's decisions, through
   their own commits); the first
   build of a new verb's message (a new wire id lands through a stage with
   T2's differential oracle, ADR-010; a turbo push may fix an existing
   message, never add one); the game, SKSE, an upstream Skyrim Platform version (item 2's (d) is the
   fork's own Skyrim Platform source) or the driver stack, which ADR-030 reserves for a full sweep before promotion.
4. **What is recorded.** Every push gets a line in docs/LOG.md's playtest
   entry when it lands: the class, the head (sha8, fork or thuum), what it
   replaced, and the minutes from the ask to the seats playable. The pushes
   accumulate on one branch, the session's train, merged by `just verb-merge`
   after the session like any train; nothing a turbo push laid is promoted.
   The checklist names the sha8 each tick was played on (ADR-033's record).
5. **Rollback is one command, prepared before the first push.** Before a
   session's first turbo push, `just playtest-save turbo-<n>` keeps the live
   world as playtest-turbo-<n>-<UTC stamp> (playtest-world.sh:25-30). `just turbo-back` returns the seats to the
   last good build: the previous SERVER_TAG and `compose up -d` (the image is
   still local), the kept file or dist for the client, a relaunch; a world a
   server push damaged is `just playtest-restore playtest-turbo-<n>-<stamp>`,
   the full name `just playtest-worlds` lists (restore takes only playtest-
   names, playtest-world.sh:34; it relaunches both seats, :38-53). The fallback, when a file-level
   revert is not trusted, is the cold rollback to clean-m1-next, the stage's
   snapshot that every run returns to (lab/labapi/labapi/guests.yaml:30-31),
   through the client-only route the Consequences name. A turbo lay is
   ephemeral by construction: the next run's rollback erases it
   (client-driver.sh:4-6), so the nightly sweeps the stage, never a turbo
   build.
6. **The checks run after, on the train.** At the checklist, the accumulated
   train is staged as any train (`verb-stage` under ADR-040: dist reuse,
   probes, T2 beside them), gated (ADR-030 as ADR-040 item 2 scopes it) and
   merged; the nightly stays the cross-verb net. A gate red holds the merge
   and reopens the finding; the playtest's ticks stand as evidence of what
   was played, as ADR-040 item 1 already has it. T0 is never skipped: it runs
   inside server-build for (b) and (c) and inside the Windows build's ctest
   for (d), and turbo waits for both.
7. **The law holds.** A verb ships whole at its merge (rule 3): a turbo push
   is a stage of a branch, not a merge, and the branch merges whole or not at
   all. Client-reported anything stays untrusted (rule 5): turbo changes
   where a build runs, not what a validator accepts, and a push that loosens
   one is reviewed on the train like any change. Scenario YAML is reviewed and
   travels alone (rule 13): turbo carries none. The wire widens only with its
   contract and validator (rule 4) and bytes are recognized in Rust first
   (rule 12): the same crates are built. ADR-030's "no promotion without its
   gate" holds because turbo promotes nothing.
8. **Measured.** Per push, LOG.md carries "asked HH:MM, playable HH:MM, N
   min, class, sha8"; the session's line sums them. Targets: (a) 2 min, (b)
   10 today and 5 with the incremental build, (c) and (d) 40 today and 15
   with the cached Windows build, (f) 6 to 8. Reviewed after five sessions
   that used it.

**Consequences.** A broken seat mid-session costs the minutes its push
took, since the push is file-level and `turbo-back` is its reverse; the
worst case is the cold rollback to the stage's snapshot (63 to 90 s and the
boot), which loses nothing the world holds, and a seat not back online in
five minutes is the signal (playtest-relaunch.sh:36). An untested server
change against persistence meets a saved world: the file driver writes one
JSON per changeForm (docker-compose.yml:32; lab/tools/test-proto.sh:235), a
server that reads them wrongly is caught by a-restart-persistence on the
train and by the restore during the session, and schema changes never enter
(item 3). Divergence between what was played and what merges is bounded by
item 4: the train is the sum of the pushes and nothing else, every push
named by sha8 in the LOG and the checklist, and the stage after the session
lays the train's head afresh (not the turbo files), so what merges is what
the gate ran, and what was played is on record against the shas it was; a
gate red means a finding was played on a build that does not merge, which
ADR-040 item 1 already accepts. The build levers are the real clock: without
them (c) and (d) stay at half an hour, and they belong to ADR-040 (ccache or
a kept build directory for server-build, its item 4; a warm Windows builder
or sccache on the hosted one, its item 3); this ADR adds the paths that let
(a), (b) and (f) run at their floors now. A hot push would also reload
lab-driver.js, which shares the folder (SkyrimPlatform.cpp:127-129), so
turbo never runs beside a run; the hold already forbids it (item 1).

The tooling, numidium's (the lab's tooling is its since 2026-10-15;
thuum-magnus builds the fix and reads the results), in this order:
`just turbo-client`, a local `yarn build` and the one-file lay into every
game folder of both clones with the replaced file kept under
`C:\sky-lab\turbo\<stamp>\`, a relaunch per seat with the online check, and a
`--hot` form that writes without the relaunch once measured;
`just turbo-srv <tag>`, the tag switch, `compose pull && up -d`, the ready
wait, the previous tag kept in `/srv/lab/turbo.log`;
`just turbo-back`, item 5's reverse of the last push;
`just turbo-log <class> <sha8> <asked> <playable>`, item 8's LOG.md line;
lab-api `POST /lab/clients/<c>/rollback {to}`, a stop, a disk rollback and a
start as `rollback_sequence` does (lab/labapi/labapi/proxmox.py:134-138),
allowed under a playtest hold as promote is (lab/labapi/labapi/app.py:356-369);
and the hot-reload measurement, a probe that writes a changed
skymp5-client.js into one seat's Plugins folder and reads that seat's Skyrim
Platform log and the online list; until it is green every (a) push
relaunches. Until each recipe exists its step is done by hand from the
primitives named above, and the LOG line says so.

In plain words: today, with no new tooling, a TypeScript fix reaches both
seats in 25 to 45 minutes (the Windows build), a server fix in 8 to 11 (the
server build and the reconnect), a mod layer in 5 to 7, a wire or Skyrim
Platform fix in 25 to 45. With the one-file lay and the tag switch asked for
here, a TypeScript fix is about two minutes and a server fix stays near ten
until the build is incremental (then about five); the wire and native
classes drop under fifteen only when the Windows build is cached or built
warm. Nothing goes under about two minutes, one build, one hop, one
relaunch, and nothing skips T0.

## ADR-042: A merge's gate may cite the nightly that swept its build

Status: ACCEPTED 2026-10-20 12:24 PDT (Eli: "accept 42 and 43"); proposed 2026-10-19 (numidium). Amends ADR-030 (the gate
at the merge) and ADR-040 item 2 (a train's gate scoped to its rows). The
nightly, ADR-027's watch rule, T2 and the clones' promotion stay as they are.

**Context.** Under ADR-040 item 1 the playtest runs on the stage, so a stage
stands from the evening through the next morning's playtest. The nightly
(ADR-030: every committed scenario, from 03:30 PDT) sweeps exactly that build.
The morning's `just verb-merge` then reruns a subset of the same scenarios on
the same build. That costs 51 to 75 minutes of lab before the next stage can
start (ADR-040's table: train-24's gate 23 runs in 51 min, train-26's 27
scenarios and 2 reruns in 75 min). Until 2026-10-19 a run's record named only
the game version, so nothing could show which build a sweep swept. Since main
7bf200a every result.json carries `build`: the server container's image id,
and each managed clone's snapshot with the description its staging wrote
(verb-stage: the branch, the client's commit, the date).

**Decision.** `GATE_SET=<run set id> just verb-merge <branch> [scenario...]`
cites a finished run set instead of running the gate. The tool checks five
things before parity moves:

1. The set's verdict is green or watch (ADR-027). It holds every scenario the
   gate would run: `always`, the named ones, and `watch`.
2. Its runs played one build: the same `build.server.id` and the same clone
   snapshot descriptions in every run.
3. That build is the branch's stage. The server id equals the image id of the
   registry's `skymp-server:<branch slug>-<staged sha8>`, and the descriptions
   name `<branch> client <staged sha8>`.
4. The branch head is the staged commit, or differs from it in docs only. A
   change to anything that builds runs the gate: server, client, CI, or the
   workflow (88c43e77's .github action would have).
5. Nothing replaced the stage after the set began: no verb-stage, layer-stage
   or turbo push (/srv/lab/turbo.log, the stage's log).

If any check fails, the gate runs as it does today, and the tool says which
check failed. The LOG entry names the cited set and its run ids.

**Consequences.** A morning merge after a nightly costs no lab time beyond
the T2 it already cites, and the lab goes straight to the next stage: about
an hour back on each two-playtest day. The net stays the same net, since the
nightly is a superset of the gate on the same build.

What could differ is a regression that would show only in a rerun between the
nightly and the merge. Checks 4 and 5 keep anything that builds from changing
in that window, so what is left is nondeterminism, which ADR-027's watch rule
already handles.

The first citable nightly is the one after the next lab-api pull, which
brings the `build` field (main 7bf200a). The tooling: verb-merge's
`GATE_SET` and its checks, numidium's.

## ADR-043: The world stores every form plugin-relative; a load order change migrates a world, never undresses it

Status: ACCEPTED 2026-10-19 19:32 PDT (Eli: "accept those ADRs"); proposed 2026-10-19 17:50 PDT (Eli, playtest twenty-six, the essentials layer:
"its likely an unacceptable state of affairs that any mod added will fuck
up rotferns appearance and items. however we handle mod layers, it cannot
break the game every time a new mod is added, because single player doesnt
work that way."). Accepted the same evening. Extends ADR-026 (the appearance follows its
look) and ADR-029 (mod layers); touches rule 6 (a schema change ships with
a migration and a restart-persistence scenario).

**Context.** The world (the change forms the server saves) names forms by
their runtime id: the load order's slot in the top byte, the plugin's local
id below. Tonight the essentials layer moved every plugin's slot (Apocalypse
from 0C to 1A, LostGrimoire from 0B to 28, rotfern.esp from 08 to 2F), and
the twenty-five world restored under it broke in four ways at once: test 1's
appearance named rotfern's race by the old slot, so her race did not resolve
and the server ACCEPTED the client's default Nord as a new appearance and
wrote it over her record, taking her RaceMenu preset, favorites, map
markers, shouts and staff rank with it (numidium's read of the 17:25 event);
her rotfern.esp items and her Apocalypse spells became dead ids in the
record; the lab's own scenarios named mod forms by slot and went red
(fixed the same evening: lab-api resolves "<local hex>:<plugin>" against the
run's order, main 74c4844 and f473a97). Restoring her took a hand re-base of
eight head parts, a race and a texture set, a server stop, a record patch
and a relaunch, four minutes of two sessions' work for one character; every
player and every world would need the same at every layer. Single player
has no such problem because the engine resolves a save's forms by plugin
name at load (a save carries its plugin list and remaps), and that is the
shape to copy.

What the world already stores plugin-relative: the RaceMenu preset (RaceMenu's
own "plugin|id"), favorites, map markers, the shout record and the staff
rank (all FormDesc since their verbs), and every server setting (bonds,
castTeleports, headshot, playerGlobals). What it does not: the appearance
(race, head parts, texture set), the inventory and the equipment, learned
spells, running effects and their sources, and anything else a change form
keeps as a raw form id.

**Decision.**

1. Every form the world stores is a FormDesc, "<local hex>:<plugin>", the
   shape the settings and the lab already use, including the appearance's
   race, head parts and texture set, the inventory's and equipment's base
   forms, learned spells, running effects (the MGEF and its source), and any
   field a later verb adds; a raw runtime id in a change form is a bug.
   Resolution to the runtime id happens at load against the live load
   order (one function, FormDesc::ToFormId; a plugin that is not loaded
   resolves to nothing and the entry is kept, not dropped, so the record
   survives a plugin's absence and a return).
2. A saved world carries the load order it was saved under (its espm file
   list), and a migration converts a world written in the raw shape into
   the plugin-relative one using that order; `just playtest-restore` and the
   server's own load migrate on the way in, once, and mark the world
   migrated. Worlds already saved tonight and before are migrated by the
   order their snapshot's settings name.
3. The server refuses a login appearance whose race or parts do not resolve
   in its order, and keeps the record it holds; it never accepts a client's
   default and never overwrites a record from a login. The client is told
   (the race menu may open; what it sends from there is judged the same).
4. The wire keeps runtime ids: a message is one session's, both ends share
   the order, and the server translates at its edge as it does today. Only
   what is written to disk changes.
5. A mod layer render stops caring about slots: it never re-bases a world,
   a profile or a scenario; the lab's profiles (lab/playtests) and
   scenarios name forms as FormDesc already, and the server does the same.

**Consequences.** A schema change (rule 6): the change form's structs, their
JSON, a migration with a version mark, a T0 that saves a world under one
order and loads it under another with identical state, and the
restart-persistence scenario extended with a load order change (a stacked
snapshot, as the rest verb's schema change ran). Load time: one string
match per stored form at load, negligible. Until it lands, a world
restored under a changed order is re-based by hand as tonight, or not
restored.

The map (docs/research/formdesc-world-map.md, read against fork e3806870
the same evening) sizes the work. Twelve raw fields in five structs hold a
runtime id: the appearance's race, head parts and texture set (stored as
JSON text inside appearanceDump), the inventory entry's base, enchantment
and poison (appearing twice, under inv and under equipmentDump), the
equipment's four spell slots, learnedSpells, and the legacy effects map
(a dead write path, deletable). Nineteen fields are FormDesc already, but
six of them still drop or throw on a missing plugin (running effects are
dropped and the record rewritten without them; the login sends for map
markers, learned effects, favorites and shouts convert with no try), so
decision 1's "kept, not dropped" is work there too; playerGlobals is the
one field that behaves as asked and is the template. Today an appearance
whose race does not resolve skips the WHOLE change form at load, the
gamemode then creates a fresh actor with the race menu open, and the
lowest free id is handed out again, which is how the 17:25 overwrite
happened (HYPOTHESIS on the id coincidence; the mechanics are read).
Stale learned spells are worse than wrong: the server refuses them in a
hand and sends Actor.RemoveSpell to the player's own game. There is no
version mark in the record and nothing persists the load order; the
pattern for an optional field is presence (at_pointer), and the one
in-memory migration (legacy effects to running effects) re-runs on every
load. The trap that sets the cost: Appearance, Inventory and Equipment are
the same structs on the record and on the wire, so retyping their fields
would change the wire against decision 4. Two shapes avoid it: stored
twins (FormDesc fields living only in the change form, converted at the
MpActor and MpObjectReference accessors against the live order, every
runtime API keeping its uint32), or conversion at the record boundary
(after parse in WorldState::LoadChangeForm and before upsert in
TickSaveStorage, since JsonToChangeForm is static and order-less and the
drivers call it with no world in reach). The world's order is saved beside
the records as the first non-change-form file in world/, and the version
mark is one top-level key read with the same presence guard. Cost,
re-estimated from the map: three sessions of server work (the twins or the
boundary conversion with the appearanceDump rewrite; the migration, the
order file and the version mark; the appearance refusal, the six
keep-on-miss fixes and the tests) and one lab session (the scenario). The
earlier estimate of two was made before the map.

**Alternatives.** Pin the slots forever (a layer may only append plugins
after every existing one): brittle, since any master-ordered plugin, an
.esl among the masters, or a dropped mod moves slots, as the layer did
tonight for three reasons. Re-base worlds by tool at each layer (tonight's
four minutes made a script): the same slot math, but run at every layer for
every world and every player, with the raw shape still underneath. Store the
raw ids plus the order and translate only when the order differs: the
decision's migration half without its durable half, and a second code path
at every read.

- [x] accept (Eli, 2026-10-19 19:32 PDT: "accept those ADRs")
- [ ] accept with changes (say what)
- [ ] not yet

## ADR-044: The client's Papyrus event filter admits scripts by what they are, not by their name

Status: ACCEPTED 2026-10-19 19:32 PDT (Eli: "accept those ADRs"); proposed 2026-10-19 19:19 PDT (thuum-magnus, from playtest twenty-six's
missing Apocalypse MCM and the lab's Survival Mode reads of the same
evening); accepted the same evening. Refines ADR-029's first decision (which events a
game's scripts receive) and keeps ADR-008 (quests per player, world-shared
by allowlist) and ADR-029's server-side allowlist as they are.

**Context.** Every connected game runs under Skyrim Platform's Papyrus
event block: skymp5-client sets it at its first tick
(skymp5-client/src/services/services/blockPapyrusEventsService.ts), and
the SendEvent hook (skyrim-platform FridaHooks.cpp, OnSendEventEnter)
then replaces the name of every Papyrus event with "" unless the event is
an ActiveEffect's with the player as target or caster (ADR-031's halves),
or the event is not OnUpdate and one of the scripts attached to the
handle is NAMED SKI_*, RaceMenu*, GRIM_ALT_TeleportationMarker,
WB_DestroyAfterDelay_Script or defaultDisableHavokOnLoad. The compare
reads each script's leaf class name and never its parents, and OnUpdate
skips the list, so under the block OnUpdate reaches no script at all. The
read is docs/research/papyrus-event-filter.md; it corrects "blanks every
Papyrus event but OnUpdate" in ADR-029's context and in
apocalypse-options.md 3.1, which read the guard backwards (CONFIRMED the same night by the lab: x-survival-unblock 20261020-023907 lifted the block after login and nothing re-armed, since the first OnUpdate had already been blanked and the chain ends there; x-survival-unblock3 20261020-024406 lifted it and re-armed the quest, and the check ran, Survival_ModeCanBeEnabled went to 1 and the Creation's own "Enable Survival Mode?" box appeared, the single-player behavior; the brace structure has been so since upstream's 2021 version of the hook).

Two findings of 2026-10-19 are this one rule. Apocalypse's MCM is missing
under the essentials layer because WB_MCMQuest_Script extends
SKI_ConfigBase and its own name is not SKI_; the same holds for every one
of the layer's seven MCMs, MCM Helper's included (MCM_ConfigBase extends
SKI_ConfigBase), so the Mod Configuration list shows SkyUI alone. Survival
Mode never enables in a connected game (x-survival-probe 20261020-020321,
x-survival-why 20261020-020729: the quest runs, MQ101 at 0, exterior, the
switch at 1, Survival_ModeEnabled and the prompt at 0 twelve seconds on,
while a solo run of the same save, which loads no skymp5-client and so no
block, shows the prompt) because its 5 s check is RegisterForSingleUpdate
then OnUpdate. Behind them stands the essentials layer itself: a hundred
mods whose quests and aliases run on these events the way single player
runs them, and Eli's standing on layers (ADR-043's context): "it cannot
break the game every time a new mod is added, because single player
doesnt work that way". Admitting them one name at a time is the shape the
law forbids (one name per mod per playtest, each a client build), and
ADR-029's "quests' and aliases' stay blanked" was written for vanilla's
and Apocalypse's world mechanisms, not for a settings menu or a needs
meter.

The layer in numbers (apocrypha's census, docs/research/layer-papyrus.md on
apocrypha/layer-essentials, each script's parent class read from its .pex
header, regenerated with the layer): 2,421 scripts in 44 of the 113 mod
folders; 19 mods blocked outright because their behavior is their own
quest, alias, object or perk scripts (Jewelry Limiter, Dynamic Activation
Key and the feeding tweaks keyed off it, Self Filling Bookshelves, Portal,
Reading List, General Displays, the IDRC quests and scenes among them; four
of the 19 are fixes to vanilla scripts a connected game does not run
anyway); 12 mixed, their effects running on the player and everything else
blanked, which is every magic mod (Apocalypse 162 effect scripts against
44 others, Lost Grimoire 96 against 51, Odin 50 against 27); TrueHUD, TDM
and MCM Helper losing only their menus; 69 folders shipping no script.
Three of its points shape the decision: a plugin carries its scripts
through its forms' VMAD, so admission by plugin needs the plugin's script
names (a map the census generates); OnUpdate is its own axis (Survival's
needs, Jewelry Limiter's checks and Unread Books Glow's scans are update
loops); and the ActiveEffect exemption admits an effect on the player
alone, so a magic mod's effects cast on others (mind control, thralls, a
cloak on a target) stay blanked even where its self-casts run, which is
ADR-029's server-side allowlist's ground, not this decision's.

What the filter is FOR, stated once: a game whose state the server owns
must not run scripts that change that state behind the server's back
(vanilla's quests, Apocalypse's world mechanisms, anything on ADR-029's
server-side allowlist). It has no business with scripts whose effects are
UI, or per-player state the server declares R3 or records as R2.

**Decision.**

1. Admission by class. A script passes the filter if it, or any class it
   extends, is on the admitted list; the hook walks ObjectTypeInfo's
   parent chain (CommonLibSSE-NG include/RE/O/ObjectTypeInfo.h, GetParent)
   where it reads the leaf name today. SKI_ stays the admitted root, so
   every MCM (SKI_ConfigBase and MCM Helper's MCM_ConfigBase descendants)
   and every SkyUI widget passes without a name of its own. RaceMenu,
   GRIM_ALT_TeleportationMarker, WB_DestroyAfterDelay_Script and
   defaultDisableHavokOnLoad stay as named entries until a root covers
   them.
2. Admission by plugin. A data list, served by the server with the load
   order (the layer manifest's per-plugin disposition, apocrypha's
   persist-mods rows; ADR-008's "data, not code"), names the plugins whose
   scripts run in every game: the Survival Mode Creation first. Since the
   hook sees a script's class name and not its plugin, an admitted plugin
   expands to the script class names its folder ships (the census's map,
   regenerated with the layer), and the hook keeps one set lookup. A
   script of an admitted plugin passes whatever its class. The list is
   reviewed like a scenario (rule 13): a plugin enters it with one line
   saying what its scripts touch and which rung that state already has.
3. OnUpdate follows the script. An admitted script receives OnUpdate; the
   rest stay blanked. The list is consulted for OnUpdate too, so the hook
   pays one table lookup per OnUpdate under the block; the first build
   counts the rate (a Frida counter on the hook) and caps nothing until
   the count says it must. Counted the same night, before the build (numidium,
   lab/frida/sendevent-rate.js at Skyrim Platform's own hook point, c1
   connected and idle at the camp, 5 s windows): 50 to 67 events a window,
   10 to 13 a second, OnTrigger about 30 and OnUpdate 13 to 22 of them; a
   sixteen-deep parent walk on each is noise. To be read again on the
   layer, which adds scripts.
4. State keeps its rung. A script admitted by plugin changes nothing about
   authority: a global it writes is that player's (R2, player-globals), a
   value it reads is its game's, damage or regen it applies to its own
   player reaches the server only where a verb carries it (none today, so
   Survival's needs are R3 until a verb says otherwise: cosmetic in a
   connected game, with warmth, cold, hunger and fatigue shown and felt in
   that game alone), and anything it would do to another actor stays in
   its game as ADR-029 already says. Vanilla's quests, aliases and
   references stay blanked; ADR-029's server-side effect allowlist is
   untouched.
5. ADR-029's context is corrected in place (an erratum line, no change to
   its decision).

**Consequences.** One Skyrim Platform change (train-29's row, a Windows
build): the parent walk, the plugin list read from the served file (mods/papyrus-scripts.txt, apocrypha's persist-mods beside plugins.txt, one line per admitted plugin and its script class names) at Skyrim Platform's load, before the first tick, since a script whose first OnUpdate is blanked never re-arms its chain (x-survival-unblock 20261020-023907: a block lifted after login changed nothing), so a list that arrived with the login would be too late; OnUpdate through the list. No server change: the list rides the mods root with the load order. One layer change: the manifest's disposition column. Tests: T1
none (the VM runs only in a game); the lab's x-mcm-register (a HUD trace
asserting "MCM: Registered N new menu(s)." with N the layer's eight) and
x-survival-probe's round trip extended to Survival_ModeEnabled = 1;
playtest twenty-seven's section 4 asks the decisive question before any
build. Until it lands, no mod's MCM and no Papyrus-driven mod works in a
connected game, which is the state the essentials layer is in tonight.

**Alternatives.** Keep adding names (today's shape): one client build per
mod per playtest, and a mod's own base classes never covered. Lift the
block for layer games: vanilla's quests run (Unbound, the Civil War, every
radiant quest) against a server that owns none of their state, which
ADR-008 exists to prevent. Run the mods' scripts on the server's VM
(ADR-029's allowlist): right for world mechanisms, wrong for a settings
menu or a needs meter, which have no server half. Admit by event name
(let OnUpdate through for everyone): wakes every vanilla quest's polling
loop, the one thing the block is for.

- [x] accept (Eli, 2026-10-19 19:32 PDT: "accept those ADRs")
- [ ] accept with changes (say what)
- [ ] not yet