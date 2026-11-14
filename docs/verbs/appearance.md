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
  2026-10-06: the first launch after a client install on sky-c1 (the
  m1-favorites dist, with the new mod layer) ran with ProcDump armed
  (`just client-dump-arm 711`: a mini dump per access violation, first
  chance included), logged in as profile 1 and stayed up: no access
  violation at all, so no dump. One launch, and a debugger attached changes
  timing, so the crash is unconfirmed rather than gone; the next client
  install arms ProcDump again (`just client-dumps <vmid>` fetches what it
  wrote).
  2026-10-06, second install the same evening (the 8f5365da dist), first
  launch without ProcDump: the game exited 0xC0000005 at 22:45:37 PDT, about
  50 s after the launch (Security 4689 on sky-c1); the relaunch was stable,
  as always. So far: with a debugger attached, no fault (n=1); without one,
  the fault (every time). A debugger slowing the process hiding it points at
  a race, not a fixed bad read. Next: ProcDump armed before a first launch
  that faults; arming it never lets one fault so far, so the dump may have to
  come from WER LocalDumps with the in-process handler out of the way.

## A figure's head on a seat whose own player turned vampire (HasOverlays, 2026-11-11)

The fault: on a seat whose own player turned vampire, every other player's figure drew no head, a hollow helmet with the
background through its eye slits (x-vampire-stage v2.1, run 20261111-035133: c1 after its turn drew c2's figure 0xff000846 so in
shots 187, 209 and 228); the other seat's view of the vampire stayed right. Rung: R3, the seat's own rendering of a figure.

The cause, by its tags:
- CONFIRMED-STATIC: a figure's base carries the player's form id 7 from before its first 3D load: SpawnProcess.enable calls
  applyTints before it enables the reference (skymp5-client spawnProcess.ts:21-32), and applyTints calls setFormIdUnsafe with the
  player's base id (appearance.ts:126-129), which writes TESForm::formID alone (PapyrusTESModPlatform.cpp:530-537). So a
  head-parts {other: true} read of a figure lists the reading seat's own parts (lab-api retired head_parts_of for it); a figure's
  parts are read by node.
- CONFIRMED-STATIC (data): the vampire race 0x88794 carries kOverlayHeadPartList (CommonLibSSE-NG include/RE/T/TESRace.h:77; its
  Skyrim.esm DATA flags 0x54a08942); NordRace 0x13746 and OrcRace 0x13747 do not.
- HYPOTHESIS: TESNPC::HasOverlays (CommonLibSSE-NG include/RE/Offsets.h:532) branches on form id 7 and there reads the local
  player's chargen race and an overlay-map entry (Address Library 24791, 24792), so the local player's turn flips its answer for
  every figure; once it is true, GetCurrentHeadPartByType (src/RE/T/TESNPC.cpp:94-97) takes the overlay list, which a figure does
  not have (:111-123): no Face part, no head. The function's body is unread (the static read had no Ghidra or REA).

The fix, fork m4-scripts-5-heads 24f1cc6a (Skyrim Platform only; its own train ahead of playtest 51): game/Offsets.h's
Hooks::HasOverlays names CommonLib's RE::Offset::TESNPC::HasOverlays, and FridaHooks.cpp replaces the function through Gum beside
the two hooks that exist because figures pose as the player: an NPC whose form id reads 7 and that is not the player's own base
(compared by pointer) gets false where the engine said true, so the engine builds each figure's head from its own parts, as a
seat whose player is no vampire does. Its lines, all in skyrim-platform.log: "[verb:appearance] HasOverlays hook installed: ...";
the first override per base, "[verb:appearance] HasOverlays on a figure's base (form id 7, not the player's): the engine's true
returned false (...)"; and the count every ten seconds while it moves. The fresh review's three nits ride train 52 (fork ff467dab).

The proof: x-vampire-figure-head v2.1 (lab/.cache/drafts/rung5, sha1 891d114c) GREEN on the heads stage, run 20261111-114511
(fork 24f1cc6a's client; x-werewolf-form green beside it, 115629): c2's Face and Eyes nodes present on c1 before the turn, after
it with a cell change, after c1's relaunch and after the cure; the install line once in each of c1's games and in c2's. The
override lines read the mechanism's observable half, CONFIRMED: 0 before the turn (the engine said false for c2's figure base),
the first-override line once and the count line twice after it (the engine said true, the hook answered false), 0 after c1's
relaunch as a vampire (its race written to its base at login with no SetRace, so the engine said false; HYPOTHESIS: no overlay
entry without a SetRace) and 0 after the cure; c2, whose player stayed no vampire, 0 throughout. HasOverlays' internal branch
(the chargen race, the overlay map) stays unread, HYPOTHESIS; that the local player's turn flips the answer for a figure's base
and the hook restores the head is read.

Known limit, unchanged by the fix: a vampire figure seen by any seat shows its look's parts, not its race's overlay head parts
(a non-vampire seat already answered false for it before the fix).

## Status

ADR-025 (2026-10-06) took 1.7.104 out of routine runs: players and the lab
run 1.6.1170, where SkyMP's appearance path is upstream's and works. The
port this doc tracked stops there; the first-launch fault on 1.7.104 above
stays recorded as that version's open item, not M1's. On 1.6.1170 the rows
close through the verbs that carry the appearance since:

- [x] doc complete, rung declared
- [x] engine surface cited or delegated
- [x] server logic + T0 (upstream's; lab gamemode's set-appearance)
- [x] message + validator (same commit): UpdateAppearance, MsgType 4, in
      the Rust contract (wire-schema skymp.rs) since the M1 wire port; the
      race check is the character-creation verb's (wire-rules, ctest)
- [x] native hook + T1: none on 1.6.1170 (Skyrim Platform's TESModPlatform
      natives, upstream's); the 1.7.104 crash is ADR-025's retired version
- [x] TS handler (upstream's)
- [x] T2 green (the character-creation and racemenu difftest sessions)
- [ ] T3 scenario green, no HYPOTHESIS tags on 1.6.1170 (m0-appearance: (UNTICKED 19:02 PST 2026-11-02: 3 open engine claim lines over it, the root-cause plan's W5 and VERB.md's rule; ticked again when each claim cites a run or trace id, lab/tools/verb-lint.py)
      run 20261007-005616 and the 2026-10-08 merge sweep's 20261008-093401;
      also green on 1.7.104, run 20261006-072027; a-character-creation and
      a-racemenu carry the race menu's result)
- [x] ledger and suppression registry updated: nothing to add
