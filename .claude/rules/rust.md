---
paths:
  - "skymp-wire/**/*.rs"
  - "skymp-wire/**/Cargo.toml"
---

# Rust rules (skymp-wire)

- `#![forbid(unsafe_code)]` in every crate except `wire-bridge` and
  `wire-client-ffi`. In those two, every `unsafe` block carries a `// SAFETY:`
  comment stating the invariant and who upholds it, and the block is as
  small as it can be.
- No panics on the network path. `unwrap`, `expect`, indexing with `[]`,
  and integer `as` casts are clippy-denied in codec, validate, and transport
  code; use `get`, `try_from`, and checked or saturating arithmetic. A panic
  reachable from a packet is a denial of service and is treated as a
  security bug.
- Release builds keep `overflow-checks = true` for these crates. Wrapping is
  never the intended behavior on a client-supplied number.
- Every parser has a cargo-fuzz target; every validator has property tests
  (`proptest`) that generate in-range and out-of-range inputs.
- Dependencies: `cargo deny check` passes (advisories, licenses, bans). New
  dependencies are added with a one-line justification in Cargo.toml.
  Prefer crates the transport already pulls in.
- Resource bounds are explicit: per-connection queue caps, per-message size
  caps, per-client rate limits, and a total-connections cap. Unbounded
  channels do not exist here.
- The C++ side receives decoded, validated structs across the bridge. If you
  find yourself passing raw bytes to C++, stop; that is the thing we are
  deleting.
- Keep the transport swap possible: nothing outside `wire-transport` names
  renet types (ADR-011).
