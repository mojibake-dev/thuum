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

Status: proposed

The Helgen intro is one long scripted scene with a single protagonist. Server
spawns new players after it (Unbound marked complete) rather than making
scene sync the first quest problem we solve.

## ADR-008: Quest policy defaults to per-player, world-shared by allowlist

Status: proposed

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
