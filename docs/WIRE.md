# WIRE: the network edge in Rust

Why this exists: ADR-010. What it is: one Rust workspace, `skymp-wire/`, that
owns every byte that arrives from the network, on the server and in the
client, and hands the rest of the system decoded, bounded, validated structs.
The C++ core stops parsing network input the day the bridge lands. Nothing
below is built yet; M0 builds it. Everything below is the spec for M0.

## Crates

```
skymp-wire/
  crates/
    wire-schema       message types; serde + postcard; heapless bounds; ids append-only
    wire-codec        encode/decode with per-message size caps; the only bytes-to-struct path
    wire-validate     structural validation: ranges, rates, owner shape, reason codes
    wire-transport    renet + renet_netcode server and client; channel map; token issuer
    wire-bridge       cxx bridge into the C++ server (unsafe allowed, reviewed)
    wire-client-ffi   cdylib + cbindgen header loaded by the Skyrim Platform client
  difftest/           replays recorded sessions into C++ core and Rust edge, diffs outputs
  fuzz/               cargo-fuzz targets: codec_decode, validate, transport_ingest
```

Dependency direction is strictly downward: schema <- codec <- validate <-
transport <- bridge / client-ffi. Only `wire-transport` names renet types, so
the transport can be swapped for quinn (ADR-011) without touching anything
above it.

## Transport (ADR-011)

renet channels, configured in `wire-transport::channels`:

| Channel | renet SendType | Carries |
| --- | --- | --- |
| 0 `ReliableOrdered` | ReliableOrdered | session, ownership, inventory, quests, chat, snippets |
| 1 `ReliableUnordered` | ReliableUnordered | effects apply/remove, container deltas, hits |
| 2 `Unreliable` | Unreliable | movement, animation events, aim |

SkyMP's existing RakNet reliability choices map onto these without new
semantics; the port of `Networking.cpp` is a table, not a design.

Authentication: netcode connect tokens. The lab runs `Unsecure`. A public
server runs `Secure` with a private key held by the server process and a
tiny issuer endpoint (`wire-transport::token`): password or invite in,
signed token out, over HTTPS terminated by the operator's proxy. The token
carries per-connection keys, so encryption and replay protection come with
the transport and are not something a handler can forget.

Limits live in `wire-transport::limits` and are enforced before decode:
max clients, max packet size, per-client bytes per second and messages per
second on each channel, queue depth per client, and a connect-rate cap per
source address.

## Messages (ADR-012)

`wire-schema` defines one `enum Message` with a `u16` id per variant. Ids
are append-only. Each variant is a struct whose fields are scalars or
`heapless::Vec<T, N>` / `heapless::String<N>` with capacities named as
constants next to the type and chosen from the game (inventory delta count,
effect list length, name length). `postcard` encodes; decode of an
over-capacity collection is an error at the exact field, never a truncation.

Families, mirroring the authority rungs:

- Session: hello, version, mod list hash, disconnect reason.
- Ownership: cell host grant, host handoff, host release (R0 decisions).
- Intent: movement sample, animation event, cast intent, hit intent,
  activate intent, aim pitch (R1 inputs; the validator's main customers).
- Record: NPC state under host, physics owner updates (R2 inputs).
- World: server-decided deltas broadcast to renderers (R0 outputs).
- Snippet: delegated Papyrus execution request and result (R2, ledgered).

Every message documents: direction, rung, idempotency, and the reason codes
its validator can emit. Schema export (`just wire-schema`) writes a JSON
description consumed by the napi layer for the TypeScript gamemode and by
docs; C++ never sees bytes, only structs across the bridge.

## Bridge and client FFI

Server: `wire-bridge` links into the existing C++ server through cxx and
corrosion (cargo inside the CMake build). The C++ side calls `poll()` and
receives `WireEvent { client, kind, payload }` where payload is an already
decoded, already validated struct; it calls `send()` with a struct. The old
`Networking.cpp`, `PacketParser`, and the RakNet dependency are deleted in
the same PR that lands the bridge; there is no dual-stack period on the
server.

Client: `wire-client-ffi` is a cdylib with a cbindgen-generated header. The
SP plugin loads it, calls `connect`, `poll`, `send`, `disconnect`, and
receives `#[repr(C)]` views over decoded messages. Memory is owned by Rust
and freed by Rust; the header says so per function. The client's RakNet
dependency goes in the same PR.

Migration phases:

1. M0: schema, codec, validate, transport, difftest, fuzz. Green on T2.
2. M1: bridge lands, C++ edge deleted, client cdylib lands, client RakNet
   deleted. `smoke-two-players` green on the new wire.
3. M1 onward: every new verb's handler is written in Rust behind the
   bridge; the bridge shrinks as handlers move across.

## Differential harness

The C++ core is the oracle for behavior we are not trying to change.
`difftest` replays a session (a timed list of typed messages per client,
YAML, under `difftest/sessions/`) into both stacks through their own
transports: the legacy driver speaks RakNet to the unmodified C++ server;
the wire driver speaks netcode to the Rust edge fronting the same core.
Outputs are normalized to canonical JSON (message stream per client plus a
DB dump at the end) and diffed. A divergence is a bug in one of them; the
session becomes a regression test once it is settled.

Corpus: sessions are recorded from lab runs. Wireshark ships a RakNet
dissector, so `tshark` on `lab.pcap` gives the legacy message stream, and
`difftest/tools/pcap2session` turns it into YAML. Hand-written sessions
cover the rejection paths the corpus never exercises.

## Fuzzing

- `codec_decode`: arbitrary bytes into `wire_codec::decode`; must return
  `Ok` or `Err`; if `Ok`, encode must round-trip byte-for-byte.
- `validate`: `arbitrary`-derived messages into every validator; must not
  panic; property tests assert in-range accepts and out-of-range rejects.
- `transport_ingest`: bytes into the renet server's packet ingestion after
  a scripted connect, including fragment sequences; must not panic and must
  not grow memory past the configured caps. This target exists because
  fragment reassembly is where RakNet-class bugs live.

All three run in CI on every push to `skymp-wire/`; corpora are committed.

## What this does not fix

Authority bugs (a validator that accepts a legal-looking lie) are covered by
the rungs and the T2 rejection tests, not by Rust. Panics are still denial
of service; the rules forbid them on the packet path and the fuzzers hunt
them. `unsafe` in the two FFI crates is reviewed by hand. The client's
remaining C++ (SKSE, SP, the engine) is unchanged; a malicious server versus
a player is fixed to the depth of the cdylib and no further.

## References

- renet: https://github.com/lucaspoffo/renet
- renet2 (transport variants): https://github.com/UkoeHB/renet2
- quinn (alternative transport): https://github.com/quinn-rs/quinn
- RFC 9221, unreliable datagrams over QUIC: https://www.rfc-editor.org/rfc/rfc9221.html
- Sassaman, Patterson, Bratus, Shubina, "The Halting Problems of Network Stack Insecurity", USENIX ;login: 36(6), 2011: https://langsec.org/papers/Sassaman.pdf
- Google, "Rust in Android: move fast and fix things" (2025): https://blog.google/security/rust-in-android-move-fast-fix-things/
- Wireshark RakNet dissector fields: https://wireshark.org/docs/dfref/r/raknet.html
- RakNet-compatible Rust crates evaluated and rejected: https://github.com/b23r0/rust-raknet, https://docs.rs/rak-rs
