# Verb: appearance

The first verb of the 1.7.104 port (ADR-018): a player's character, as made
in the race menu, reaches the server and comes back to every client,
including the player's own next login. SkyMP has this on 1.6.1170; on
1.7.104 the client dies applying it. This doc tracks the port of that path.

## Intent

A player makes a character once; the server owns the record; every client,
the player's own included, renders it from the server's record.

Roadmap reference: SkyMP "done" column (appearance), docs/PLAN.md M0
Milestone: M0   Class: A

## Authority

Rung: R0
Why this rung and not the one above it: the server stores the record and
only accepts it while it has the race menu open for that actor
(skymp5-server ActionListener::OnUpdateAppearance); clients never trust each
other's look.
What the server validates (R1) or records (R2): records the Appearance
struct (skymp5-server Appearance.h: isFemale, raceId, weight, skinColor,
hairColor, headpartIds, headTextureSetId, options, presets, tints, name)
once per race-menu session.
Rate limit / bounds: one accepted update per race-menu open.

## Engine surface

- CommonLibSSE-NG symbol(s): the client applies the record through Skyrim
  Platform's TESModPlatform natives (skyrim-platform/src/platform_se/
  skyrim_platform/PapyrusTESModPlatform.cpp: SetNpcSex, SetNpcRace,
  SetNpcSkinColor, SetNpcHairColor, ResizeHeadpartsArray, ClearTintMasks,
  PushTintMask, SetFormIdUnsafe, CreateNpc) over RE::TESNPC, RE::TESRace,
  RE::TintMask and RE::BGSHeadPart (CommonLibSSE-NG include/RE/T/TESNPC.h,
  include/RE/T/TintMask.h), and through the generated save's NPC change form
  (skyrim-platform LoadGame.cpp ModifyPlayerFormNPC, savefile
  SFChangeFormNPC.cpp).
- Address Library ID(s): none used directly by the natives; layouts come
  from the CommonLib headers pinned for 1.6.1170 (b93280e8), which is the
  suspect: any TESNPC, TESRace or TintMask layout change in 1.7 corrupts
  memory here.
- Found 2026-10-01 (Frida first-chance trace, then Ghidra on the 1.7.104
  program): the fault is CommonLib's PlayerCharacter::GetTintList, reached
  from TESModPlatform's tint natives (PushTintMask, ClearTintMasks). In
  1.7.104 the player's tint array sits at PlayerCharacter+0xB20 (count at
  +0xB30), 8 bytes further than 1.6.1170; the pinned headers read the
  overlay-list pointer at +0xB30 and got the tint count (0x22 = 34 for the
  recorded character), then faulted reading its size at 0x32. Evidence:
  ghidra/notes/playercharacter-tints-1-7-104.md (GetNumTints 40700 and
  GetTintMask 40698 decompiled). Fix: overlay patch 08 on the fork's
  CommonLib port (skyrim-1.7 branch); the overlay pointer at +0xB38 is a
  HYPOTHESIS until tints are seen applying.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the race menu close; skymp5-client sends UpdateAppearance.
- SP filter (minSelfId / maxSelfId / eventPattern): n/a (own player only)
- Data captured: the Appearance struct above
- Side effects of hooking here: CONFIRMED on 1.7.104 (the server recorded
  profile 1's appearance on 2026-10-01 11:34 after R, Enter on sky-c1).

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet): skymp5-client
  sync/appearance.ts applyAppearanceToPlayer (own player, after loadGame
  with changeFormNpc) and applyAppearance (others, CreateNpc).
- Visual without simulation achieved by: TESNPC edits plus
  queueNiNodeUpdate.
- Side effects: the crash is gone with patch 08, CONFIRMED (sky-c1,
  2026-10-01 12:47: the client launched with the appearance on, logged in
  after 10 s, was in the world a minute later; before the patch 6 of 6
  launches with an appearance on the player ended about 4 s
  after SKSE's PostLoadGame with exit status 0xC0000005 (Security event
  4689 on sky-c1, 2026-10-01 11:45:59 and 11:48:28), no dialog, no
  application error event, no dump even with WER LocalDumps set: something
  in-process handles the access violation and terminates. Launches without
  an appearance (race menu open) never did this on cold boots (6 of 6). The
  no-tints bisect crashed too, as ClearTintMasks walks the same pointer.
  Still HYPOTHESIS: the overlay pointer's new offset (0xB38) and the tints
  rendering as recorded; both are settled by m0-appearance's view
  assertions or a third-person screenshot.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing; the engine renders what it is given.
- How: n/a
- Release condition: n/a
- Side effects: n/a

## Message contract

- Message name / numeric type: UpdateAppearance (skymp5-server
  cpp/messages/UpdateAppearanceMessage.h), SetRaceMenuOpen (29),
  CreateActor's appearance and isRaceMenuOpen fields.
- Direction: client to server (UpdateAppearance); server to clients
  (CreateActor, SetRaceMenuOpen).
- Fields: the Appearance struct.
- Validator rules: accepted only while isRaceMenuOpen for the actor.
- Idempotency / ordering: last accepted wins.
- Contract doc updated: no (legacy C++ messages; the Rust contract follows
  in M1).

## Server

- Where the logic lives: skymp5-server ActionListener::OnUpdateAppearance,
  MpActor::SetAppearance; the lab gamemode's set-appearance labCommand
  (lab/gamemode/gamemode.js, presets under lab/gamemode/presets/).
- DB fields / migration: appearanceDump in the actor's change form; no
  migration.
- Restart behavior: persisted with the world (file driver).
- Papyrus natives touched (ledger lines added): none new.

## Client

- SP binding: TESModPlatform natives above; loadGame(changeFormNpc).
- TS handler: skymp5-client remoteServer.ts createActor handling,
  sync/appearance.ts.
- Kill switch config key: none; the lab bypasses the path by rolling the
  server back to a world without the appearance (snapshots/clean-empty-*).

## Tests

- T0: lab/gamemode/gamemode.test.js (set-appearance, labState hasAppearance)
- T1: none yet
- T2: none (needs a real client)
- T3 scenario id: lab/scenarios/m0-appearance.yaml (two clients);
  lab/scenarios/smoke-solo.yaml exercises the own-player path first.
- Assertions that would fail if the verb silently regressed:
  server.actor(c1).hasAppearance == true; c2.view(c1).race ==
  server.actor(c1).race.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/exit-trace.js (first-chance exception handler
  plus hooks on ExitProcess, TerminateProcess, RtlExitUserProcess,
  NtTerminateProcess, exit, _exit, abort, RaiseFailFastException; logs
  module+offset backtraces). Injection with frida-inject 17.19.0 from
  C:\sky-lab\frida on sky-c1; the first attempt attached at process start
  and never loaded its agent before the crash, the second attaches 7 s in.
  Fallback: Sysinternals ProcDump as a debugger (`procdump64 -e 1 -f
  c0000005 -ma -w SkyrimSE.exe`), which sees the first-chance exception
  before any in-process handler; the dump is parsed on the Mac (python
  minidump) for the faulting module, offset and stack.
- Trigger: the launch of a client whose profile has an appearance (the
  server's clean world carries profile 1's since 2026-10-01).
- Expected if the layout hypothesis holds: the faulting pc inside
  SkyrimPlatform.dll (a TESModPlatform native) or inside SkyrimSE.exe with a
  SkyrimPlatform.dll frame on the stack, reading or writing a TESNPC,
  TESRace or TintMask field; the same function decompiled from the 1.7.104
  Ghidra program then shows the field at a different offset than the
  1.6.1170 header declares.
- Falsifies it: a fault with no SkyrimPlatform.dll frame and no NPC change
  form involvement (then the generated save or an unrelated 1.7 change).
- Breakpoint plan for a human session: none needed yet.
- Owner: agent (Frida, ProcDump)
- Open since patch 08 (2026-10-02/03, on the wire): sky-c1 (profile 1,
  which carries an appearance) still dies with 0xC0000005 on the first
  launch after a client install, three times out of three, about 3 s after
  connecting and right after SKSE loads the generated save (Security 4689 at
  23:42:27 local on 2026-10-02 was the latest); every relaunch after that is
  stable, and sky-c2 (profile 2) has not crashed. HYPOTHESIS: the same tint
  or overlay path (the overlay pointer at +0xB38 is still unconfirmed), hit
  only on a run that rebuilds something Skyrim Platform caches after its
  files are replaced. Next: ProcDump attached before the first launch after
  a client install on sky-c1 (procdump64 is staged in C:\sky-lab\frida),
  and the dump read for the faulting module and stack. Frida is out for now:
  the game refused its agent on 2026-10-03.

## Status

- [x] doc complete, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0 (upstream's; lab gamemode's set-appearance)
- [ ] message + validator (same commit): M1, Rust contract
- [ ] native hook + T1: blocked on the 1.7.104 crash above
- [x] TS handler (upstream's)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] ledger and suppression registry updated: nothing to add
