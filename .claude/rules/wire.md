---
paths:
  - "skymp-wire/crates/wire-schema/**"
  - "skymp-wire/crates/wire-codec/**"
  - "skymp-wire/crates/wire-validate/**"
  - "**/*Message*"
  - "**/*MsgType*"
  - "**/PacketParser*"
  - "**/ActionListener*"
---

# Wire contract rules (ADR-011, ADR-012)

- The contract is `skymp-wire/crates/wire-schema`. There is no separate
  document to keep in sync; docs/WIRE.md explains, the crate defines.
- Numeric message ids are append-only. Never renumber, never reuse, never
  change a field's meaning; add a new message instead.
- Every collection in a message is a fixed-capacity `heapless` type with the
  capacity chosen from the game, not from convenience. Every message type has
  a `MAX_ENCODED_LEN`. Exceeding either is a decode error, never a truncation.
- No recursive types. No `Vec`, `String`, `Box`, or `HashMap` in wire types.
- Decode is total: arbitrary bytes produce `Ok(msg)` or `Err(WireError)`,
  never a panic. `fuzz/codec_decode` proves it and runs in CI.
- Validation is structural here (bounds, ranges, rates, owner shape) and
  semantic in the server (does this client own that actor). Both reject with
  a reason code the lab can grep.
- Anything the host can resend must be safe to receive twice; state it in
  the message's doc comment.
- A new message needs a verb doc naming it and a T2 test for the rejection
  path as well as the happy path.
- Legacy: the C++ `PacketParser` and `ActionListener` are the differential
  oracle until deleted (ADR-010). Do not add features to them.
