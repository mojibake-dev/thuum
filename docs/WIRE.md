# WIRE: the network edge in Rust

Why this exists: ADR-010. What it is: one Rust workspace, `skymp/skymp-wire/`
inside the fork (ADR-015), that owns every byte that arrives from the
network, on the server and in the client, and hands the rest of the system
decoded, bounded, validated structs. The C++ core stops parsing network input
the day the bridge lands. Nothing below is built yet; M0 builds it.
Everything below is the spec for M0.

## Crates

```
skymp/skymp-wire/
  crates/
    wire-schema       message types; serde + postcard; heapless bounds; ids append-only
    wire-codec        encode/decode with per-message size caps; the only bytes-to-struct path
    wire-validate     structural validation: ranges, rates, owner shape, reason codes
    wire-transport    renet + renet_netcode server and client; channel map; token issuer
    wire-bridge       cxx bridge into the C++ server (unsafe allowed, reviewed)
    wire-client-ffi   cdylib loaded by the Skyrim Platform client; committed C header
  difftest/           replays recorded sessions into C++ core and Rust edge, diffs outputs
  fuzz/               cargo-fuzz targets: codec_decode, validate, transport_ingest
```

Dependency direction is strictly downward: schema <- codec <- validate <-
transport <- bridge / client-ffi. Only `wire-transport` names renet types, so
the transport can be swapped for quinn (ADR-011) without touching anything
above it.

Pins (ADR-015): heapless 0.7 with `serde`, postcard 1.1 with `heapless` and
`experimental-derive` (its `MaxSize` derive over heapless types needs exactly
this pair), renet 2 with the renet_netcode release that pairs with it,
rust-version 1.88 for cxx. cbindgen is not a dependency: it is a CLI run by
`just wire-header`, the header it generates is committed at
`crates/wire-client-ffi/include/skymp_wire.h`, and `just wire-header-check`
in CI diffs a fresh generation against the committed file.

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
max clients (netcode), max reassembled message size, bytes per second per
client, channel memory as the queue depth (renet disconnects a client whose
reliable channel fills), and messages per second per family (the validator's
token buckets). Not enforced in the crate: a connect-rate cap per source
address. The netcode transport owns the socket, so nothing above it sees a
handshake before it is processed; that cap lives at the host firewall until
the transport grows a hook for it, and this sentence is the record of the gap.

## Messages (ADR-012)

`wire-schema` defines one `enum Message` with a `u16` id per variant. Ids
are append-only. Each variant is a struct whose fields are scalars or
`heapless::Vec<T, N>` / `heapless::String<N>` with capacities named as
constants next to the type and chosen from the game (inventory delta count,
effect list length, name length). `postcard` encodes; decode of an
over-capacity collection is an error at the exact field, never a truncation.

Decode is canonical as well as total. postcard accepts overlong varint
encodings on input, so two byte strings can decode to one message; the codec
re-encodes what it decoded and compares, rejecting a mismatch with
`E_WIRE_NONCANONICAL`. A message therefore has exactly one byte
representation on the wire, which is what lets `codec_decode` assert a
byte-identical round trip and what keeps the recognizer's input language no
larger than the messages need.

Families, mirroring the authority rungs:

- Session: hello, version, mod list hash, disconnect reason.
- Ownership: cell host grant, host handoff, host release (R0 decisions).
- Intent: movement sample, animation event, cast intent, hit intent,
  activate intent, aim pitch (R1 inputs; the validator's main customers).
- Record: NPC state under host, physics owner updates (R2 inputs).
- World: server-decided deltas broadcast to renderers (R0 outputs).
- Snippet: delegated Papyrus execution request and result (R2, ledgered).

Every message documents: direction, rung, idempotency, and the reason codes
its validator can emit. Replay protection follows the channel: Movement
rides Unreliable with "later sample wins", so its check is monotonic on
`seq`; Hit rides ReliableUnordered, where reordering is legal and a
monotonic check would drop legal hits, so the validator keeps a sliding
window bitmap of recently seen `seq` values per client and rejects only a
repeat inside the window. Schema export (`just wire-schema`) writes a JSON
description consumed by the napi layer for the TypeScript gamemode and by
docs; C++ never sees bytes, only structs across the bridge.

## Bridge and client FFI

Server: `wire-bridge` links into the existing C++ server through cxx and
corrosion (cargo inside the CMake build; the import is a relative path
because the workspace lives in the fork). The C++ side calls `poll()` and
receives `WireEvent { client, kind, payload }` where payload is an already
decoded, already validated struct; it calls `send()` with a struct. The old
`Networking.cpp`, `PacketParser`, and the RakNet dependency are deleted in
the same PR that lands the bridge; there is no dual-stack period on the
server.

Client: `wire-client-ffi` is a cdylib with a committed C header generated by
the cbindgen CLI. The SP plugin loads it, calls `connect`, `poll`, `send`,
`disconnect`, and receives `#[repr(C)]` views over decoded messages in
arrival order. Memory is owned by Rust and freed by Rust; the header says so
per function. The client's RakNet dependency goes in the same PR.

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
transports and diffs the normalized outputs (message stream per client plus
a database dump at the end, canonical JSON). A divergence is a bug in one of
them; the session becomes a regression test once it is settled.

Drivers:

- legacy: `fakeclient`, one binary in the fork built on the fork's own
  client networking code, speaks RakNet to the unmodified C++ server. It is
  also the `just test-proto` harness, so T2 and difftest share one client.
- wire: `wire_transport::Client` speaking netcode. In M0 it runs against an
  in-process Rust edge recorder that logs accepts and reason codes, because
  the bridged server it will front lands in M1; from M1 it targets the
  bridged server beside the legacy one on sky-srv.

Sessions declare expected divergences per step, because the C++ server may
accept what the validator rejects; a declared divergence is reviewed like a
validator change.

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

All three run in GitLab CI on sky-ci (ADR-016): a bounded run on every push
that touches `skymp/skymp-wire/`, a longer run nightly; corpora are
committed.

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
- postcard wire format: https://postcard.jamesmunns.com/wire-format
- Sassaman, Patterson, Bratus, Shubina, "The Halting Problems of Network Stack Insecurity", USENIX ;login: 36(6), 2011: https://langsec.org/papers/Sassaman.pdf
- Google, "Rust in Android: move fast and fix things" (2025): https://blog.google/security/rust-in-android-move-fast-fix-things/
- Wireshark RakNet dissector fields: https://wireshark.org/docs/dfref/r/raknet.html
- RakNet-compatible Rust crates evaluated and rejected: https://github.com/b23r0/rust-raknet, https://docs.rs/rak-rs
