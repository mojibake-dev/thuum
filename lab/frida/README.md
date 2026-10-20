# lab/frida

Frida scripts lab-api serves to clients (`GET /lab/frida/scripts/<name>`) and
runs on them (`POST /lab/frida`, `just frida <script> <client>`). The client
side is Frida's standalone injector, frida-inject 17.19.0 for Windows x86_64
(the release's `frida-inject-<ver>-windows-x86_64.exe.xz`, unxz'd into
lab/.cache/frida/ and staged into C:\sky-lab\frida by `just client-frida
<vmid>`); it attaches to SkyrimSE.exe by name, loads the script, and prints
`console.log` lines and `send()` payloads to its stdout, which lab-api redirects
to C:\sky-lab\frida\<script>.out and reads back as an artifact. Attaching at
process start failed once (the agent never loaded before the game died); from a
few seconds in it works, so lab-api waits for the process and five seconds more.
The injector must run in the lab user's session, the game's own: as SYSTEM
through the guest agent it reported "refused to load frida-agent" on both
clones (2026-10-05), so lab-api hands its watcher to the sky-lab-run task.

Scripts use Frida 17's API: a module's exports come from its Module object
(`Process.getModuleByName(m).findExportByName(n)`); the static
`Module.findExportByName(m, n)` is gone in 17 and throws "not a function".

- exit-trace.js: who ends the process. A first-chance exception handler
  (module+offset, backtrace, registers) plus hooks on every orderly exit path.
  Found the 1.7.104 appearance crash on 2026-10-01 (docs/verbs/appearance.md).
  Until 2026-10-05 its exit hooks never loaded (the static call above threw
  right after the exception handler was set), so only the handler ran.
- handle-trace.js: who leaks handles. Records the stack of every handle the
  listed creators return (NtCreateEvent, NtOpenEvent; one row per creator),
  forgets what NtClose closes, and every 30 s prints the stacks of the handles
  still open after 10 s. Found the idle-client leak on 2026-10-05: WinHTTP
  requests from SkyrimSE.exe to api.bethesda.net, two Event handles each, never
  closed (lab/deploy/sky-client/README.md, "The game's traffic outside the
  lab"). Pair it with Sysinternals Handle (`handle64 -s -p <pid>`, staged in
  C:\sky-lab\tools) to pick the leaking type first.
- console-trace.js: every line the game's console prints, timed. Skyrim
  Platform's printConsole and its JavaScript exceptions end there, so a run
  keeps skymp5-client's own trace lines (logTrace, logError) and each item
  an inventory apply adds. Hooks RE::ConsoleLog::VPrint at its Address
  Library offset for the exe's own file version (1.6.1170 and 1.7.104).

- launch-trace.js: every Projectile::Launch with a backtrace, and whether a
  SkyrimPlatformImpl.dll frame is in it (Skyrim Platform's
  TESModPlatform.LaunchArrow) or the engine launched by itself. For
  playtest thirteen's two arrows on the target's screen
  (docs/verbs/marksman.md). Projectile::Launch at Address Library 44108
  (CommonLibSSE-NG src/RE/P/Projectile.cpp:258), 1.6.1170 only.

- face-dump.js: what the renderer holds for a face right now. A read-only
  walk of the player's and every figure's loaded 3D (one call into the game,
  LookupReferenceByHandle, to turn the process list's actor handles into
  references) that prints one line per face geometry: shader property class
  and flags, material class and specular colour, power and scale, every bound
  texture with its live D3D11 size and format (ID3D11Texture2D::GetDesc), and
  the texture set's paths. Hooks nothing, so it can attach to a game in play;
  each resolved reference keeps one extra reference count. Found rotfern's
  gloss on 2026-10-07: her head's specular slot bound to BSShader_DefNormalMap,
  the engine's stand-in for a texture that did not load, because the mesh
  named a dependency's files (docs/verbs/racemenu-sync.md). Offsets are
  CommonLibSSE-NG's for 1.6.1170, cited per field; mind that a two-number
  REL::RelocateMember is (SE and AE, VR), and a RelocateMemberIfNewer shifts
  every field comment of its struct by the newer start.

- poison-trace.js: the game's poisoning of a weapon (docs/verbs/poison.md):
  the poison box's opener and its callback, InventoryEntryData::PoisonObject,
  the PoisonedWeapon event's send, and the equip event's send, which a
  poisoning never reaches. With params {ANSWER_YES: true} (a scenario's frida
  step) it answers the box itself, calling the callback with Yes on the
  opener's return. Address Library ids 40481, 40482, 16024, 41044, 38386,
  1.6.1170 only.

- effect-stack-trace.js: whether two streams of one spell from one caster
  both work on one target (docs/verbs/spell-cast.md, dual casting). Hooks
  ValueModifierEffect's Update and ModifyActorValue through its vtable
  (Address Library 206143) and prints, for one spell (params {SPELL}, Flames
  by default), each effect object as it first updates (hand, target,
  magnitude) and every 500 ms each effect's call counts. Offsets are
  CommonLibSSE-NG's, cited per field; 1.6.1170 only.

- push-trace.js: where Unrelenting Force's throw stops in the target's game
  (docs/verbs/push.md). Logs every OnEffect* and OnMagicEffectApply event the
  VM is asked to send (SendEvent, Skyrim Platform's own hook point, 104800),
  its handle split in halves; each Papyrus PushActorAway (56213, HYPOTHESIS)
  with the pusher and the pushed; and each AIProcess::KnockExplosion (39895),
  every ragdoll's entry, with its actor, source and backtrace. Hooked beside
  Skyrim Platform's SendEvent hook, it runs first, so the names are the
  engine's before the block. 1.6.1170 only.

- hud-trace.js: what the game shows on its HUD and who asked
  (docs/verbs/shouts.md, the re-teach at login). Hooks
  UIMessageQueue::AddMessage (13631) for the HUD's notification, center,
  quest, skill and word-of-power messages, and DebugNotification (52933),
  each with the caller's frames as module+offset. Found on 2026-10-12
  (x-reteach-probe) that Game.TeachWord raises the word-of-power message
  (HUD type 21) and AddShout and UnlockWord raise none. 1.6.1170 only.

- mps-trace.js: what draws Fire Breath's flames, breath by breath
  (docs/verbs/shouts.md, the god-mode second breath). Polls the master
  particle system of addon index 64 (ADDN MPSFireWaveFlames 0x647BC) every
  50 ms, checked by its vtable (238521), with its emitter and particle-object
  counts and destroyWhenNotInUse (CommonLibSSE-NG
  include/RE/B/BSMasterParticleSystem.h); logs the cone's launches (44108),
  Init3D (44222), emitter registration (19633, 16817, 76597), the emits on
  that system (76893), a rebuild that changes it (76603) and the cone's Kill
  (44110). With params {ALWAYS_LOADED: true} it first sets the addon's flags
  to kAlwaysLoaded, the test of the fix. The function roles and the manager
  at 411270 are the re-analyst's static read (HYPOTHESIS). 1.6.1170 only.
  mps-trace2.js is the same with the system's maxEmitterObj and
  maxParticlesPerFrame read too (BSMasterParticleSystem.h 0x162, 0x164),
  for breaths seconds apart (x-tgm-breath4: the emitter cap hypothesis).

- launch-source-trace.js: launch-trace.js plus the LaunchData's fields that
  say which hand and whose spell each launch is: origin, projectile base,
  shooter, spell, castingSource (MagicSystem::CastingSource, 0 left hand, 1
  right) and useOrigin (CommonLibSSE-NG include/RE/P/Projectile.h:81-107).
  For playtest eighteen's left-hand Firebolt leaving the figure's right hand
  (docs/verbs/spell-cast.md, x-left-firebolt). 1.6.1170 only.

- action-trace.js: the engine's action path, call by call
  (docs/verbs/cast-action.md): every ActorMediator::PerformAction (38949,
  the one entry every BGSAction goes through, a cast's four phases included)
  with its TESActionData's source, action and index, input type, event,
  idle, result and flags on entry and on exit and the return; every call of
  the mediator's second entry (38953, the one Skyrim Platform's performAction
  uses, which performs a data as given); and every cast-shaped graph event
  (MRh_, MLh_, DualMagic, shout, Voice, Cast) sent to the player's or a
  figure's holder (IAnimationGraphManagerHolder::NotifyAnimationGraph, 32901),
  tagged with whether a PerformAction is open on that thread. The test of the
  re-analyst's read of 2026-10-14 (the event empty on entry and chosen on
  exit, the type 2, the indices 45..52 and 60..63, no cast event without an
  action around it) and of each performAction replay on a figure. Layouts
  are CommonLibSSE-NG's, cited in the script; 1.6.1170 only.

- figure-cast-trace.js: what the engine does for a figure's cast in the
  observer's game (docs/verbs/cast-action.md: the interrupted and the
  spawned-mid-cast rows). Every hook filters to the figures (dynamic ACHRs,
  ids 0xFF......) and logs: each graph event the figure's holder is sent and
  whether the graph took it (NotifyAnimationGraph, 32901); each
  PerformAction (38949, dry runs skipped) and each replay through the second
  entry (38953) with the action, the event chosen, the idle and the return;
  the figure's own caster's FinishCast (34435), InterruptCast (34408),
  StartCharge (34443), CastSpell (34401), RequestCastImpl (34136) and
  CastSpellImmediate (slot 01 of ActorMagicCaster's vtable, 205828, checked
  against 34404 at attach), each with the hand; and the begin-cast response
  handlers (42820 right, 42819 left) with a backtrace, the actor decoded
  when the handlers' vtables confirm IHandlerFunctor's signature, raw and
  capped at 200 emits otherwise. Layouts are CommonLibSSE-NG's, cited in the
  script; 1.6.1170 only.

- figure-dent-trace.js: where the hitter's own game writes its sword hit
  into a FIGURE's Health (docs/verbs/figure-values.md; train-29 row 3, the
  local dent). Replaces the function in slot 0x104 (Actor::HandleHealthDamage,
  CommonLibSSE-NG Actor.h:458) of VTABLE_Character[0] (207886),
  VTABLE_PlayerCharacter[0] (208040) and VTABLE_Actor[0] (207511) with a
  NativeCallback of the header's signature, so the float damage is read as
  passed, and logs the victim, the attacker, the damage, the victim's Health
  before and after through its own ActorValueOwner, its kAttackDamageMult
  (the fork's guard test), which slot's function ran and how many nested
  calls it made; Actor::DamageActor (37335, TE's gate, docs/TE-MAP.md) with
  raw arguments and Health before and after; the explosion pass (43849,
  ADR-037) raw. The ready row says whether the fork's thunk sits in each
  slot. Run on the hitter's seat; the seq order of a hit's rows tells whether
  the vfunc is a pre-write gate or a post-write notification. 1.6.1170 only.

- rune-tier-trace.js: the tier test in a landed rune's look on the OBSERVER
  (docs/verbs/spell-cast.md, the target-location section; train-29 row 5,
  the undressed glyph). Logs Projectile::Launch (44108) for a player's or a
  figure's shooter with the new handle resolved; the impact-effects pass
  (44213) once per landing with the shooter handle against *(403520), the
  tier the REA read says that compare grants (0 or 4 the player, 0xC anyone
  else), bit 20 before and after, the raw arguments and the return; the
  trigger tick (44216) and test (44217) for grenades, deduped; the arrival
  (44163), Init3D (44222) and settle (43919); the kill (44110) with a
  backtrace; AddRune (40674) and its gate (43934) against *(401069). Every
  row carries the projectile's summary (shooter resolved from its handle,
  cell, explosion, spell, timers, flags); the ready row self-tests the
  layout by resolving *(403520) to the player. 1.6.1170 only.

- rune-decal-trace.js: the rune's glyph as a decal, read on the CASTER
  (docs/verbs/spell-cast.md, the target-location section; train-29 row 5;
  the re-analyst's REA read of 2026-10-20, question 2: the glyph is a decal
  placed by 44186 from inside the target-location launch 34452 after
  Projectile::Launch, a path the relay's bare Launch never takes). Logs the
  decal placement 44186 at its entry (args 0 to 7 raw, arg 0 as the
  projectile with its shooter resolved, args 1 and 2 as NiPoint3 position
  and scaled normal, arg 3 as the material id, the return address relative
  to 34452 and whether a 34452 call is open on the thread) and at its leave;
  the material lookup 44190 (raw args, the return read both as a
  BGSMaterialType and as the id; every call inside a 34452 bracket, the
  first 24 outside it); 34452 at its entry (args 0 to 8 raw, the pick
  struct's normal, collidable and flag by the memo's offsets, HYPOTHESIS)
  and at its leave with the bracket's launch, material and decal counts;
  and Projectile::Launch (44108) as rune-tier-trace.js does, plus
  contactNormal, angles, autoAim and useOrigin. The ready row lists every
  id with its RVA and checks that 34452 and 44186 lie inside SkyrimSE.exe.
  The hypothesis stands on one decal row per cast from inside 34452 on the
  caster and none on the observer; a decal row from elsewhere falsifies it.
  Ids by lab/addr.py, cited per line to the memo; 1.6.1170 only.

A frida step right before a console step on the same client leaves the
console unopenable (x-figure-action 20261015-052852 and -053059: "the
console did not open 3000 ms after the grave key", twice, with the attach
one step earlier; every earlier scenario attached on the other client or
followed the attach with Papyrus steps). Put a client's console steps
before its frida step; whether injected key input (hold-key) survives the
attach is x-action-trace-input's question.

A trace ends with the game: restart it (or let the next rollback do so) once
the .out has what you need. A run collects the traces started during it as
frida/<client>-<script>.jsonl; one started outside a run is fetched by the next
run just before its rollback, as frida/<client>-<script>.before-run.jsonl. Never kill frida-inject under a running game. On
2026-10-05 that left sky-c1's game to crash ten minutes later inside
frida-agent.dll_unloaded (WER event 1000, 0xC0000005), and on sky-c2 the agent
stayed loaded. Read the first lines of the .out right after attaching: a
script that throws at load still prints its error there. A script that walks
the stack on every memory commit (NtAllocateVirtualMemory) never reported;
hook rarer functions, or sample.
