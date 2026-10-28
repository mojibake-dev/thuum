# Verb: mod-lock

Status: BUILT, server and client, unproven at T2 and T3 (fork m3-mod-lock, three commits, pushed 12:53 PDT 2026-10-28); drafted (12:32 PDT 2026-10-28, thuum-cf; the friend deployment's item 3, docs/research/deploy/friend-playtest.md
section 3 on thuum branch friend-deploy, "the enforcement (G3a)"; ADR-055 records the deployment's decisions).

## Intent

A client whose plugins differ from the server's is refused at the handshake with a reason it can show, so a friend
with a stale or extra mod never half-joins a world whose form ids differ from theirs; a matching client is welcomed
and logs in as today. The server decides from its own load order; the client's list is the thing compared.

Roadmap reference: none (ROADMAP.md names mod dissemination nowhere; the lab's load-order rule is docs/verbs/light-plugins.md)
Milestone: M3 (the friend deployment's first half)   Class: A

## Inventory (ADR-031: the action's consequences, before its rung)

Not an engine action: nothing the engine plays depends on it. One consequence each way.

| consequence | seen in | disposition |
| --- | --- | --- |
| a refused client sees why (a text on its screen, the reason in its console and skyrim-platform.log) | the client's own render | native (the client's text, as the LOAD ORDER ERROR text today) |
| a welcomed client logs in as before (the login CustomPacket follows the Welcome) | the server log | native |

No parity scenario: there is no reference trace to compare (the recorder measures the engine's play, and this verb
plays nothing).

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| a matching client connects, disconnects, connects again (two Hellos on two connections) | b-mod-lock | |
| a client with one plugin missing; one extra; two swapped; one light plugin off; a plugin with a different CRC (a re-saved esp) | x-mod-lock, then b-mod-lock's cases | |
| a second Hello on a live connection (a protocol error the server closes on, wire-schema lib.rs:168) | T2 only (the fakeclient) | |
| a Hello that never comes (an old client): the login CustomPacket first | T2 (refused with E_MOD_LOCK_NO_HELLO after the grace), the lab's old-client run | |

## Authority

Rung: R0
Why this rung and not the one above it: the server decides the session (wire-schema lib.rs:167: "the server decides
everything about a session"); the client's list is an input the server compares with its own files, nothing a client
computes for the server to validate. Rule 5: the list is untrusted; a client that sends the server's own hashes while
running other files is not caught here (a cooperative check for friends on one manifest, not anti-cheat; a signed
manifest is ADR-011's token work, later).
What the server validates (R1) or records (R2): nothing beyond the message's shape (the validator's caps).
Rate limit / bounds: one Hello per connection; at most cap::MODS (255, wire-schema lib.rs:43) hashes; the name
cap::NAME; the Refuse carries one u16 reason code (lib.rs:283 to 287).

## Engine surface

- CommonLibSSE-NG symbol(s): none in the engine. The client reads its load order through Skyrim Platform's
  Game.getModCount / getModName and getLightModCount / getLightModName and each file's size and CRC32 through
  sp.getFileInfo, as skymp5-client/src/services/services/loadOrderVerificationService.ts:117 to 127 and 165 to 173 do
  today. The light flag the server reads from a plugin's TES4 header is bit 9 of its record flags
  (CommonLibSSE-NG include/RE/T/TESFile.h:48, kSmallFile), as skymp5-server/ts/manifestGen.ts:17 to 27 reads it.
- Address Library ID(s): none.
- If UNKNOWN: not applicable; no RE.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: none. The client's connectionAccepted event (networkingService.ts, the transport's first event) is
  where the Hello goes out, before the login CustomPacket (authService.ts:608 to 637).
- SP filter: none.
- Data captured: the plugin lists (full in load order, light in the engine's light order), each file's size and CRC32.
- Side effects of hooking here: none (no hook).

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet): the server's Refuse (wire id 2) arrives before the transport closes;
  the client renders the reason as the load-order text does today (createText, loadOrderVerificationService.ts:93 to
  101) and logs it; a Welcome (id 1) lets the login proceed.
- Visual without simulation achieved by: a text; nothing in the world.
- Side effects: none.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: the client's own HTTP check of the server's manifest (settingsService.getServerMods, the
  master API's /api/servers/<key>/manifest.json), which fails on every lab launch ("Request/parse error: Could not
  establish connection", five tries) and would fail for a friend without the master API; the Hello replaces it.
- How: loadOrderVerificationService stops fetching when the server answered the Hello; the text it drew is the
  Refuse's reason instead.
- Release condition: none (a session rule).
- Side effects: none.

## Message contract

- Message name / numeric type: Hello (wire id 0, C2S, exists: wire-schema lib.rs:173 to 183), Welcome (id 1, S2C,
  lib.rs:277), Refuse (id 2, S2C, lib.rs:283 to 287). No new message; the change is that both ends now send and read
  them. Hello's mod_hashes gains its definition here (the schema's comment says "hash per mod in load order" and no
  more).
- Direction: Hello C2S once per connection, first; Welcome or Refuse S2C once.
- Fields (name: type, units, bounds): Hello.schema_version u16 (= SCHEMA_VERSION); Hello.client_build u32 (the
  client's build number; compared against an allowlist later, accepted for now); Hello.mod_hashes Vec<u64> of at most
  255: one per plugin, the full plugins in the engine's load order first, then the light plugins in the engine's light
  order, each hash FNV-1a 64 over lowercase(filename) + 0x00 + size as u32 little-endian + crc32 as u32 little-endian
  (both ends compute it from the same three facts; archives are not in the list); Hello.name String of at most 256.
  Welcome.client_id, Welcome.server_time_ms as today. Refuse.reason u16: the wire-transport reason codes, three new:
  E_MOD_LOCK_COUNT (the counts differ; the server's counts in the log), E_MOD_LOCK_MISMATCH (the first differing
  index; the server logs its own filename at that index), E_MOD_LOCK_NO_HELLO (a login CustomPacket before any Hello,
  after the old-client grace).
- Validator rules: schema_version (exists, wire-validate lib.rs:695); the caps (bounded types); client_build any;
  a second Hello on a connection is the protocol error the schema names.
- Idempotency / ordering: one Hello per connection, before anything else; the server answers once; a late Hello is
  refused.
- Contract doc updated: docs/WIRE.md's Session line gains the hash definition and the three reason codes (same commit
  as the rule and the fixtures, rule 4).

## Server

- Where the logic lives: Rust (ADR-010). wire-rules gains mods.rs: `expected(list: &[ModFile]) -> Vec<u64>` (the hash
  per file in the two-part order), `judge(expected, got) -> Verdict` (Ok | Count {server, client} | Mismatch {index}),
  with the FNV-1a 64 and the light flag read from the TES4 header's flags (bit 9) or the .esl extension. The bridge
  (wire-bridge lib.rs, Server::poll) handles Hello itself: the server's list is set once after startup by the core
  through a bridge call (`wire_server_set_mods(json)` with the loadOrder's files, sizes, CRC32s and light flags, the
  same facts manifestGen writes), the verdict sends Welcome or Refuse and, on a refusal, disconnects after the Refuse
  is sent; the core sees only welcomed connections' later messages (no C++ handler: "new handlers are Rust").
  The login CustomPacket of a connection without a Hello is refused with E_MOD_LOCK_NO_HELLO after a grace of one
  server setting (`modLock.graceMs`, default 0 once every client sends a Hello; the lab's old-client run measures the
  switch-over).
- DB fields / migration: none.
- Restart behavior: none to keep; the list is computed at every start.
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: none new (Game.getModName and sp.getFileInfo exist).
- TS handler: a HelloService: at connectionAccepted it builds the two lists, hashes them (FNV-1a 64 in TS over the
  same bytes; a shared test vector in both repos), sends Hello through the wire's typed path, and holds the login
  until Welcome; on Refuse it draws the reason and stops reconnecting. loadOrderVerificationService keeps its console
  print of both orders for the operator and drops the HTTP fetch once the Hello path is live.
- Kill switch config key: `modLock` in server-settings.json (default true once shipped; false answers every Hello
  with Welcome and logs the verdict, the first stage's setting).

## Tests

- T0: wire-rules mods.rs (equal lists Ok; a missing light plugin Count; two swapped full plugins Mismatch at the
  first; a different CRC Mismatch; an archive never in the list; the hash against a fixed vector); wire-validate
  (Hello at the caps; a second Hello refused); wire-json fixtures for Hello, Welcome and Refuse read through the C++
  serializer (fork-wire-fixture-pairing).
- T1: none (no native).
- T2: the fakeclient's session sends a good Hello (Welcome, the login proceeds) and a bad one (Refuse with the code,
  the connection closed, no actor created); the differential harness carries the session.
- T3 scenario id: lab/scenarios/b-mod-lock.yaml (after the probe x-mod-lock): c1 as today is welcomed; c2 with one
  plugin disabled through the lab's plugins lever (the layer tools' plugins.txt write, numidium's grammar) is refused,
  its console and skyrim-platform.log carrying the reason, the server log the index and filename; c2 restored and
  relaunched is welcomed.
- Assertions that would fail if the verb silently regressed: server.log_count("mod-lock: refused .* E_MOD_LOCK") on
  the bad seat; c2.log_count("Refuse .* E_MOD_LOCK_MISMATCH"); the bad seat never online (server.online excludes it);
  the good seat online.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

None: no engine behavior is hypothesized. The one measured number is the old-client grace (the lab's run of a client
without a Hello), a setting, not a hypothesis.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (none in the engine; the SP calls and the TES4 flag cited)
- [x] server logic + T0 (wire-rules mods.rs: the hash vectors, the order, the judgement, the manifest's parse; the bridge's handling; cargo test and clippy clean)
- [x] message + validator (same commit: wire-json's "w" forms with the DLL's version fill, wire-transport's 501 to 503, the bridge's judgement; the contract in docs/WIRE.md)
- [ ] native hook + T1 (not applicable)
- [x] TS handler (HelloService, AuthService's wait for the Welcome, the session route in NetworkingService; tsc clean, the hash's node check against the vectors)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031) (not applicable: no engine play)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated (no natives; the HTTP check's retirement noted)
