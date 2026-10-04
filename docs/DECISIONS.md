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
- **A second client set.** The same clones get a second game folder holding
  1.6.1170, with SKSE 2.2.6 and the client dist, and a second snapshot set
  that records that folder as the game directory.
- **Where the files come from.** Steam's own depots for that build,
  downloaded once:
  - `download_depot 489830 489831 8442952117333549665`
  - `download_depot 489830 489832 8042843504692938467`
  - `download_depot 489830 489833 1914580699073641964` (the exe)
  - Sources: the [Wildlander wiki's downgrade guide](https://wiki.wildlandermod.com/09-How-Do-i/HowDoI/downgrade/)
    and the [Nexus article](https://www.nexusmods.com/skyrimspecialedition/articles/12471),
    which agree.
  - The result is kept in rpool/sky/persist like the other licensed files,
    never in a repo.
- **Choosing per run.** lab-api picks the client set per run. A scenario
  runs against either version, and the regression sweep runs against both.

**Consequences:**
- Scenario runs per version double the lab time of a full sweep.
- The Ghidra project gains the 1.6.1170 program beside 1.7.104
  (docs/LAB.md), and a verb's engine facts name the version they were read
  on.
