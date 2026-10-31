# Verb: locks

Drafted 00:2x PDT 2026-10-31 from docs/VERB.md and a code map of the fork at parity dc3ec679 (pile item 8 of
docs/private/turbo-2-prework.md; M4's "doors, locks, containers" row); built 04:xx to 06:xx PDT the same day as fork
m4-locks (stacked on m5-leveling and m3-wall-pose for the message ids), the Status boxes below. One design fact
changed the Observe half while building: every door and container is activation-blocked in this game
(objectReferenceEx.ts's dealWithRef, so the player's E never reaches the engine and goes to the server as an
Activate), so the engine's lockpicking menu cannot open by itself; the server prompts it (LockPrompt) and the
client runs the engine's own activation on its locked reference.

## Intent

A locked door or container is locked for every player until the server says otherwise: the lock level and the
key come from the game files, a key in the player's record opens it, a lockpicking success reported by the
player's game opens it after the server's check, a broken pick costs a lockpick from the record, and the state
survives a restart. Today the client strips every lock it sees and the server knows of none.

Roadmap reference: skymp/ROADMAP.md "Lockpicking" ("The ability to break open doors and chests, their lock level
must be from the game files. Possibility to open with keys.")
Milestone: M4   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "a player tries a locked reference": by activation with a key, by the lockpicking minigame, by a
console command. The reference trace is owed (lab/references/lockpick.json: a solo pick of a Novice chest with
the recorder); the records are the REFR's XLOC (level, key, flags) and the LockpickingMenu's runtime data.

| consequence | seen in | disposition |
| --- | --- | --- |
| the activation on a locked reference opens the Lockpicking Menu instead of the reference (no key held) | record (XLOC), engine | native: the player's own game runs the menu (R3); the activation itself is not sent until the lock is gone (Observe) |
| the activation with the lock's key in the inventory unlocks and opens | record (XLOC key) | imposed: the server checks the key in the record and unlocks (R0), the activation proceeds as today |
| the minigame's success: the lock turns, "Lock picked" HUD line, the reference unlocked, Lockpicking skill use | engine | native on the acting seat; reported (R1): the server validates and writes the unlock, every other seat applies it; the skill use is leveling's (M5) |
| a broken pick: the pick shatters, one Lockpick leaves the inventory, numBrokenPicks up | engine (LockpickingMenu runtime data numBrokenPicks, CommonLibSSE-NG LockpickingMenu.h:62) | reported (R1): one Lockpick removed from the record per broken pick, bounded by the count held |
| the menu left (Tab): the reference stays locked | engine | native; nothing sent (the server's state never changed) |
| "requires key" locks refuse the minigame ("This lock cannot be picked") | record (LOCK_LEVEL kRequiresKey, ExtraLock.h:17) | native on the seat; the server refuses a pick report on such a lock (E_LOCK_KEY) |
| the lock's sound and the pick's clicks | engine | native, R3 (the acting seat alone; observers hear nothing today, a later slice) |
| the console `unlock` on a seat | engine | suppressed as state: the local unlock stands only until the server's lock arrives again (a report with no pick and no key is refused and the lock re-imposed) |
| a leveled lock (XLOC flag kLeveled) | record | imposed: the server resolves the level once from the record at first touch (the engine's own leveled rule is the server's, HYPOTHESIS on its formula until read) |
| the Lockpicking skill's advance per pick | engine | later: leveling (M5, pile item 12) |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the pick again within a second (two attempts, one broken pick each) | x-lockpick | |
| the key path, the pick path and the refused console unlock on the same chest | x-lockpick | |
| both seats at one locked chest (the second sees the first's unlock) | b-lockpick | |
| a relaunch and a server restart with the chest unlocked (the state kept) | b-lockpick | |

## Authority

Rung: R0 for the lock state (locked, level, key), R1 for a pick's result, R3 for the minigame itself.
Why this rung and not the one above it: the state has no rung above R0; the minigame's outcome is the engine's
random sweet spot and the player's hand, which the server cannot recompute, so the result is reported and bounded
(R1), as a hit is; the menu is the seat's alone.
What the server validates (R1): the reference is locked and in the player's reach (the activation rule's distance,
wire-rules activation.rs), its level is not "requires key", the player holds at least one Lockpick for a pick (one
consumed per broken pick, bounded by the count), one result per attempt at a rate (an attempt every 500 ms at
most, UNMEASURED), and the result's shape (success, broken, left).
Rate limit / bounds: 8 reports then 2 a second (UNMEASURED); a success on a "requires key" lock or on an unlocked
reference is E_LOCK_* and the lock is re-imposed.

## Engine surface

- CommonLibSSE-NG: `REFR_LOCK` (include/RE/E/ExtraLock.h:20-45: `baseLevel` int8 :34, `key` TESKey* :38, `flags`
  kLocked 1<<0 and kLeveled 1<<2 :22-27, `numTries` :42; `GetLockLevel` :29, `IsLocked` :30, `SetLocked` :31);
  `LOCK_LEVEL` (ExtraLock.h:9-18: kUnlocked -1, kVeryEasy 0 to kVeryHard 4, kRequiresKey 5); `ExtraLock { lock }`
  (ExtraLock.h:48-62, ExtraDataTypes.h:216 kLock); `TESObjectREFR::GetLock` (TESObjectREFR.h:407), `GetLockLevel`
  (:408), `IsLocked` (:450); `TESLockChangedEvent::lockedObject` (TESLockChangedEvent.h:13); `LockpickingMenu`
  (LockpickingMenu.h: MENU_NAME :33, runtime data pickAngle :54, lockAngle :55, damagePickAngle :56,
  pickBreakSeconds :57, sweetSpotAngle :60, partialPickAngle :61, numBrokenPicks :62, isLockpickingCrime :68,
  `GetTargetReference` :92); `TESKey : TESObjectMISC` (TESKey.h:8); the Lockpick item is default object kLockpick
  (BGSDefaultObjectManager.h:578). No address is needed: the client reads the state through Skyrim Platform's
  natives.
- Address Library IDs: none (no hook; the menu's outcome comes from events).
- Skyrim Platform: event `lockChanged { lockedObject }` (skyrimPlatform.ts:162-164, EventHandler.cpp:768-796;
  the reference alone, no level, no actor, no cause); `menuOpen`/`menuClose` with name "Lockpicking Menu"
  (Menu.Lockpicking, skyrimPlatform.ts:1243); natives ObjectReference.lock(abLock, abAsOwner) :2023, isLocked
  :2019, getLockLevel :1982, setLockLevel :2062, getKey :1979, isLockBroken :2018, getItemCount :1976;
  `containerChanged` (:211-218) is the one trace of a broken pick (the Lockpick leaves the player with no new
  container: HYPOTHESIS, the Dynamic plan reads it).
- libespm: REFR.cpp:13-53 parses no XLOC (to add: level, key, flags); DOOR.h:8-12 and CONT.h:19-24 carry no
  flags; no KEYM record (Utils.cpp:41-48 IsItem leaves keys out, as does the client's formTypeEx.ts:4-15: a picked
  key may never reach the record, a second finding to close here).
- The server's activation path: ActionListener.cpp:1921-2043 OnActivate (the reach check :2002-2014), MpObjectReference.cpp:484-549
  Activate, ProcessActivateNormal :1669-1885 (DOOR :1717-1817, container and corpse :1818-1846): the lock gate goes
  before those branches. The record: MpChangeFormREFR (MpChangeForms.h:66-216) has isOpen :85 and isHarvested :84, no
  lock. The wire: CreateActorMessage.h:69-70, :97-98 carry isOpen and isHarvested.
- The client's strip: objectReferenceEx.ts:37 dealWithRef, :58-60 `if (self.isLocked()) self.lock(false, false)` for
  every reference (callers remoteServer.ts:363, formView.ts:257, spawnProcess.ts:47); the vanilla console `lock` and
  `unlock` are not intercepted (consoleCommandsService.ts:35-71, :180-183).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: no hook. The player's E goes to the server as today's Activate (the reference is
  activation-blocked); the server's gate (MpObjectReference::ProcessActivateNormal) opens for the key in the
  record (R0, the lock property to every game, then the open) or sends LockPrompt to the player alone; the
  client's LockService runs `refr.activate(player, true)` on its locked local reference, and the engine opens its
  Lockpicking Menu (or its "requires key" box).
- SP filter: `lockChanged` is per reference, few and far between; `menuOpen`/`menuClose` by name; `containerChanged`
  filtered to the player's Lockpick leaving with no new container.
- Data captured: the reference's remote id, the outcome (success: lockChanged with the reference unlocked after a
  Lockpicking Menu on it; broken: a Lockpick leaving the player while the menu is open; left: the menu closed with
  the reference still locked, nothing sent), the count of broken picks in the attempt.
- Side effects of hooking here: none (events). HYPOTHESIS: the broken pick's containerChanged fires with the player
  as the old container and no new one.

## Impose (observers render the server's decision)

- Mechanism: the lock state travels with the reference: CreateActorProps gains `lock` (level, locked, key form id;
  absent means the game files' XLOC state as the client reads it) and UpdateProperty "lock" carries a change; the
  client applies `lock(locked, false)` and `setLockLevel(level)` on the game's reference (dealWithRef's strip
  replaced by the apply).
- Visual without simulation achieved by: the lock is state, not motion; the unlock sound plays for the acting seat
  by the engine; observers get none (the Inventory's R3 row).
- Side effects: HYPOTHESIS until the probe: setLockLevel on a leveled lock, and lock(true) on a reference whose
  XLOC says unlocked (a server-locked door) both take.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: nothing by host; the local `unlock` console and a refused pick report are undone by the
  server's re-imposed lock (UpdateProperty "lock" back to locked).
- How: the lock property's apply on the client.
- Release condition: none needed.
- Side effects: a refused success leaves the player's game unlocked for one round trip (the menu's result) and
  then locked again; the HUD's "Lock picked" line already showed. Declared, R3.

## Message contract

- Message name / numeric type: LockReport, MsgType 64 (wire id 72), client to server, reliable; LockPrompt, MsgType
  65 (wire id 73), server to client, reliable, the activating player alone; the lock state on CreateActorProps
  (`lock: Option<LockProp { level: u8, key: u32, locked: bool }>`) and UpdateProperty "lock" (the existing property
  path, the same three fields as JSON), server to client. SCHEMA_VERSION 24 (fork m4-locks c324c015, 2026-10-31).
- Direction: LockReport C2S; the state S2C.
- Fields: LockReport { refr: u32 (the reference's form id, never 0), outcome: u8 (0 the lock turned, 1 picks broke
  and the lock stands, 2 the menu left), broken: u8 (picks broken in this attempt, 0 to 8) }. LockPrompt { refr: u32 }.
  LockProp { level: u8 (the XLOC byte: 0 or 1 Novice, 25 Apprentice, 50 Adept, 75 Expert, 100 Master, 255 requires
  its key), key: u32 (0 for none), locked: bool }.
- Validator rules: refr never 0, outcome 0 to 2, broken 0 to 8 (E_VAL_RANGE); a budget of 8 then 2 a second
  (E_VAL_RATE); LockPrompt's refr never 0; the lock prop's bytes are what they are (the server's). The server's rule
  (wire-rules locks.rs): locked (E_LOCK_OPEN), within the activation reach (E_LOCK_REACH), the gap of 500 ms since the
  player's last report on the lock (E_LOCK_RATE), a key lock refusing picks (E_LOCK_KEY), a Lockpick held for a pick
  (E_LOCK_NO_PICK), a broken count of 1 to 8 (E_LOCK_RANGE), broken picks costing what is held and no more.
- Idempotency / ordering: a report for an unlocked reference is E_LOCK_OPEN (nothing changes); a success on a
  "requires key" level is E_LOCK_KEY and re-imposes the lock; a broken count above the Lockpicks held is clamped
  and logged.
- Contract doc updated: docs/WIRE.md, same commit (rule 4).

## Server

- Where the logic lives: wire-rules locks.rs (Rust, ADR-010): the state per reference (level, locked, key, from the
  record or the XLOC at first touch), the key rule on an activation (the key's base in the record's inventory
  unlocks; else the activation on a locked reference is refused with E_ACTIVATE_LOCKED and the client's menu is the
  path), the report's judgment (locked, reach, level, picks held, rate), the broken pick's consumption; PartOne and
  MpObjectReference: the lock gate in ProcessActivateNormal before the DOOR and container branches, the record's
  `lock` field, the UpdateProperty "lock" send, the console Lock and Unlock (the server's own, console.rs's rank
  table; `lock <ref> [level] [key]` since m4-locks 2d79199f, 2026-10-31: the key's base as a form id, 0 for none, a
  level alone keeping the key, so the lab stands a key lock on any reference with 255 and a vanilla KEYM the console
  then hands the player, RiverwoodAlvorHouseKey 0x36a3d; LockTest's console case), the Papyrus natives Lock, IsLocked, GetLockLevel, SetLockLevel, GetKey (ledger lines, R0) and
  OnLockStateChanged (the server's VM, when a script needs it; a stub first with its ledger line).
- libespm: XLOC parsing in REFR.cpp (level int8, key form id, flags), the KEYM record and IsItem widened (server and
  client), so keys are items the record holds.
- DB fields / migration: MpChangeFormREFR gains `lock` (optional: level, locked, key, broken count); absent reads as
  the game files' state (rule 6); a-restart-persistence's world gains a picked chest.
- Restart behavior: the record's lock state loads as saved.
- Papyrus natives touched (ledger lines added): Lock, IsLocked, GetLockLevel, SetLockLevel, GetKey (implemented, R0);
  OnLockStateChanged (event, when raised).
- Kill switch: server setting `locks` (false: the server sends every lock as unlocked and takes no report, today's
  behavior).

## Client

- SP binding: none new (the natives above exist).
- TS handler: dealWithRef applies the server's lock instead of stripping it; a LockService watches
  `lockChanged`, the Lockpicking Menu's open and close, and `containerChanged` for the Lockpick, and sends LockReport;
  ActivationService holds an Activate on a reference that reads locked (the engine's menu runs) and sends it once
  the lock is gone.
- Kill switch config key: `locks` (server), mirrored to the client in the settings the login carries.

## Tests

- T0: locks.rs (the key rule, the report's judgment by name, the pick consumption, the rate); LockTest.cpp (an
  activation on a locked chest refused without the key and accepted with it, the unlock relayed as a property; a
  success report unlocks; a broken report removes one Lockpick and no more than held; a report on a "requires key"
  lock refused and the lock re-sent; a restart keeps the picked chest); the XLOC and KEYM reads on the five-file
  load order.
- T1: none.
- T2: a difftest session with a refused report and an accepted one.
- T3 scenario id: lab/scenarios/b-lockpick.yaml: c1 and c2 at a Novice chest in the lab's interior (the premise set by
  the server's console Lock on a lab chest); c1's console `unlock` undone by the server within a round trip (the
  chest reads locked again on c1 and c2); c1 given a key by the server's console (the chest locked `lock <ref> 255 <key>`, the
  key RiverwoodAlvorHouseKey 0x36a3d handed by AddItem), activates, the chest opens on c1
  and reads unlocked on c2; a second chest locked again by the console, c1 with Lockpicks picks it (the lab's mouse
  and tap-key through the minigame: x-lockpick reads how), the success relayed to c2, the Lockpick count on the
  record; a relaunch of c2 and a server restart keep the state. Probe x-lockpick by path first (the minigame under the
  driver, the broken pick's event).
- Assertions that would fail if the verb silently regressed: a chest unlocked by a console `unlock` staying unlocked
  on the server; a pick success not reaching the other seat; a broken pick not costing a Lockpick; a locked chest
  reading unlocked after a restart.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: none. The reads are Skyrim Platform events on a lab seat: x-lockpick-read by path, c1 at a locked
  chest with five Lockpicks: the menu opened by an activation, the lab's mouse turning the pick, tap-key for the
  turn, the events logged (lockChanged, containerChanged's shape at a broken pick, menuClose), the reference's
  isLocked and getLockLevel before and after; a second leg on a "requires key" door (the message box, no menu); a
  third with the key held (the unlock, lockChanged's timing against the activate event).
- Breakpoint plan for a human session: LockpickingMenu's runtime data (numBrokenPicks :62) against the
  containerChanged count, if the event shape disagrees.
- Owner: agent (the probe); Eli if the minigame needs a hand the lab cannot give.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared (the reference trace owed)
- [x] engine surface cited or delegated (the code map of 2026-10-31; no address needed)
- [x] server logic + T0 (fork m4-locks aec38c1a, 2026-10-31: wire-rules locks.rs (five cases, the tiers from the game files), libespm's XLOC and KEYM (a key an item on both ends), the change form's lock, GetLock/SetLock/SendLockPrompt, the gate in ProcessActivateNormal, OnLockReport, the console's Lock and Unlock, the `locks` switch; unit/LockTest.cpp's three cases on Bleak Falls Temple's chests 0x371e9 and 0x3fa69 ride the pipeline)
- [x] message + validator (same commit: LockReport 64, LockPrompt 65, CreateActorProps.lock, their checks and budget, four fixtures, the C++ structs; m4-locks c324c015)
- [x] native hook + T1 (none: events and natives)
- [x] TS handler (m4-locks: dealWithRef applies the server's lock prop, applyModelLock on the property, LockService's prompt and report, the console's lock and unlock sent to the server; tsc green)
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (NATIVES.md: Lock, IsLocked, GetLockLevel, SetLockLevel, GetKey implemented, R0, verb locks)

## Open questions

- The minigame under the lab: whether the driver's mouse and tap-key can pick a Novice lock reliably (x-lockpick-read);
  if not, the probe's pick leg is Eli's at turbo 2 and the lab proves the key path, the refused console unlock and
  the broken pick (a pick broken by a deliberate wrong turn is easy to produce).
- Observers' sounds for the unlock and the pick: an R3 row today; a later slice could relay the unlock sound through
  the existing SpSnippet path.
- Doors with locks to interiors the other seat hosts: the unlock is the record's; the door's open then follows the
  door pass (ADR-047).
