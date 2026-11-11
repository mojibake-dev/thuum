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
clones (2026-10-05), so lab-api hands its watcher to the on-demand task
sky-lab-frida, registered at each use and headless (conhost --headless, with
frida-inject on the same console). A watcher with a window took the game's
foreground: the taskbar over the game and its keys lost (x-start-box
20261026-022654).

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
  (docs/verbs/push.md). Logs each Papyrus PushActorAway (56213, HYPOTHESIS)
  with the pusher and the pushed, and each AIProcess::KnockExplosion (39895),
  every ragdoll's entry, with its actor, source and backtrace. 1.6.1170 only.
  Its first run on a seat (x-push-knock-frida 20261021-142913, c2) ended in
  the game's own crash about 30 s after the attach (EXCEPTION_ACCESS_VIOLATION
  at 68782+0xF2 in an input device path, RBX a BSWin32KeyboardDevice, the
  jsonl empty), while the three offsets match the Address Library. The
  SendEvent hook (104800, every VM event through JS) it had then is gone
  since; whether it was the cause is HYPOTHESIS (sendevent-rate.js ran the
  same hook on c1 for ADR-044 on 2026-10-20; figure-cast-trace and
  launch-trace hook Skyrim Platform's own points too and run for minutes),
  so the retry without it is the isolating read. Never kill frida-inject
  under a running game (below).

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
  by default. Params (docs/verbs/npc-stream.md): SOURCES 'all' or a list of
  form ids admits the world's NPCs (what they perform through the entry, and
  whether their graph events come inside a PerformAction: the stream's
  in-flight mark), EVENTS 'all' admits every event name for them,
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

- npc-puppet.js: the spinning wolves' autopsy (probe P0, docs/verbs/
  npc-puppet.md) and the puppet shape's counts (probe P1). Params {MODE:
  'p0'|'p1', ACTOR: formId}. P0 hooks the keep-offset planner agent's
  per-frame facing goal (42182: the actor's own angle plus the offset,
  REA 2026-10-21), the keep-offset mode flip (41734) and every
  SetRotationZ (37230) with its caller, summarized per second per actor.
  P1 counts, for one actor, the movement step 37356 (zero once puppet),
  Actor::Move 37507 (one per frame with a zero translation under hook 3),
  the controller's simulate 78275 with its step time (never zero), the
  rigid-body controller's two step-time readers (a zero is Skyrim
  Together's #901 hazard), the relay's SetPosition 37309 and the animation
  job 41453's distinct handles. Offsets by `just addr` for 1.6.1170 only;
  xmm arguments are not readable in Frida's context, so angles are read
  back from the actor on leave.

- exception-trace.js: every exception raised in the game, by thread, with
  its stack: KERNELBASE RaiseException (a C++ throw's code 0xE06D7363 with
  the thrown class names read from its ThrowInfo; any other code as SEH)
  and Frida's first-chance fault handler (access violations and kin,
  passed on). Repeats within a second are counted. For the landing hang of
  2026-10-21 (docs/verbs/npc-puppet.md): the dump showed Skyrim Platform's
  JS worker spinning in V8's stack-handler unwind after a JS entry exited
  without unwinding, so this names the throw if it recurs. Place its step
  before `connect` so it attaches during the load screen.

- napi-trace.js: what Skyrim Platform's JavaScript bridge was doing when a
  game stopped (docs/verbs/npc-puppet.md, the landing hang of 2026-10-21
  and 2026-10-22). Three layers in one step: libnode.dll's exported
  Node-API entry points (every C++ callback by name and thread, learned at
  registration from napi_create_function, napi_set_named_property,
  napi_define_properties and napi_define_class; every C++ to JS call with
  its status; every JS exception raised from C++ with the callback in
  progress and the frames; the reference and handle-scope calls per thread,
  which show a second thread touching the engine), the engine's Papyrus
  native dispatch NativeFunctionBase::Call (Address Library 104651, the
  name and class at this+0x10 and +0x18 per CommonLibSSE-NG's
  NativeFunctionBase.h:62-63) by thread, and exception-trace.js's
  RaiseException and first-chance faults. One line per second with the
  counts; every throw and escape as it happens; and when the bridge has run
  and then stays silent for QUIET_S seconds (3), one line with the last RING
  (300) bridge events and the last NATIVE_RING (200) natives. Skyrim
  Platform runs the game's JavaScript on one pool thread and the natives a
  script calls on the thread that called OnUpdate (main.cpp:118-131), so a
  thread id other than those two in the counts is a finding by itself. Place
  the step after a `relaunch` and before `connect`.

  Attach timing (2026-10-22): the injector attaches by process name after
  a 5 s wait, so a `frida` step placed after a `relaunch` lands on a game
  already past kDataLoaded (x-npc-napi-trace 071646 hooked 1 s after the
  hang it was meant to watch; x-npc-landing-trace 054932's exception trace
  the same). A game to be read from its start takes `relaunch {until: gone,
  frida: {script, params?}}`, which arms the watcher while the game is
  stopped and lets the launch start it (lab-api 51d7764).

## npc-locomotion.js

docs/research/m3/re-puppet-locomotion.md's probes F1 and F2 for one actor (`frida {script:
npc-locomotion.js, params: {ACTOR: 0x13483}}`): at the actor's graph tick (20123) the four
MiddleHighProcessData fields the Speed, Direction, TurnDelta and TargetSpeed channels poll, and
at the Speed channel's poll (38330) the value the graph is about to get, per second per actor,
plus the animation job's distinct handles. On a puppet under train-33's detour the fields hold
the relayed sample every tick; zeros there say the write did not reach the tick (F5, the stage
order, or another writer). Attach to the running game after the seat stands where the actor
is; no relaunch needed (the hooks are the per-frame path, not a login).

- voice-lines.js: how a topic info's response lines start and end on a
  talking actor (train 57, docs/verbs/npc-stream.md's Dynamic section; the
  re-analyst's read in docs/private/re-voice-responses.md). Hooks
  SpeakSoundFunction per line, the bark path's line start, the dialogue
  menu's Actor::UpdateInDialogue, the topic info event sender, the AI
  update's continuation (counted per actor) and the start of an item's
  current response; a summary every ten seconds. Run on a host seat talking
  to Sven through a multi-line topic, then standing for barks, 120 s
  (x-voice-lines by path). Address Library ids by `just addr`, 1.6.1170 only.
- quest-stage-chain.js: the engine's chain from a quest stage's set to its
  Papyrus fragment, on both seats (docs/verbs/quest-stage.md slice two;
  docs/research/m3/re-quest-fragment.md). Hooks the Papyrus native
  SetCurrentStageID, the console's setstage, EnsureQuestStarted, the setter,
  the done bit, the per-entry log step, the VM's stage sink, the fragment
  lookup (the script and fragment names), the dispatch functor, the item-done
  event and the latent return; `QUEST` keeps one quest, `RAW` prints unknown
  args. Expected orders for a local setstage and for a relayed apply are in
  the header; a relayed pair under the planned detour shows the item-done
  inside the sink's frame with no lookup. Run on either seat during
  x-quest-mode or c-riverwood.
- story-location.js: the Story Manager's Change Location event on a seat
  (docs/verbs/quest-stage.md H-56a; docs/research/m3/re-story-location.md).
  Hooks the event manager's AddEvent against the Change Location index
  static, PlayerCharacter::SetParentCell (the player's currentLocation
  against the cell's), BeginStartUpQuest and the location-change SendEvent.
  Expected: a placement into Riverwood raises one event and starts 74a83; a
  login inside raises none until m3-story-arrival's native queues one. Run
  on the arriving seat through x-story-arrival-login.
- prop-contact.js: the player's Havok contact with a prop
  (docs/verbs/prop-physics.md, ADR-058; docs/research/m3/re-havok-contact.md).
  Hooks the character proxy's ContactPointAddedCallback (the collidable's
  layer, the owner body's motion type, the reference by FindCollidableRef)
  and the surface pass's impulse body. Expected: the simulating seat sees a
  contact with motion type 1 to 3 then the impulse every step; the other
  seat sees motion type 4 and no impulse. Struct offsets are read from the
  CommonLibSSE-NG headers named in the header. Run on both seats through
  x-prop-push. v2 (2026-11-11, for x-prop-engine v1's E2): Main's thread in
  the ready row and a `main` field on every row, the ready row's pid, base
  and first bytes, a liveness row every 10 s; and the impulse body read at
  the interaction event's +0x30 (v1 read the event itself as the body).
- prop-grab.js: the player's grab of a prop (docs/engine/havok-props.md rows
  E13, E14, E15, E31; docs/verbs/prop-physics.md A2, A6). Hooks
  PlayerCharacter::StartGrabObject (40552; the grab fields before and after,
  the grabbed reference by LookupReferenceByHandle) and DestroyMouseSprings
  (40557, the release; EndGrabObject is inline in CommonLibSSE-NG), and
  polls the player's grabbedObject, grabObjectWeight and grabType once a
  game frame inside the player's own update (v2; v1 polled every 250 ms on
  Frida's thread), the runtime data at the newer layout's 0x3E0 start, so
  each header comment plus 8, emitting on change. Expected: the grabber's
  seat shows the call, a handle and a weight held until the release; the
  other seat shows no call and handle 0 throughout, and a second hand on the
  same body shows a call with the handle still 0 or no call. Written
  2026-11-03 for x-prop-arbitration leg 3 on both seats; never run. v2
  (2026-11-11, ADR-071 rung 0's H5, x-corpse-grab v1): the grabbed
  reference's facts at each grab, release and handle change (its form
  type, an actor's life state, its 3D's bodies by motion type with each
  bone's name, layer and kAnimTargeted bit, and the kBlockActivate bit of
  its ExtraFlags, the block canon puts on every dead NPC body); the
  grabSpring array (0x8A0) with each spring's vtable checked against
  VTABLE_bhkMouseSpringAction (208070) and the body its Havok action
  names, matched by value against the walk; every 30 frames while held,
  the named bodies' positions and speeds; the ready row's pid, base, Main's
  thread and first bytes, a liveness row every 10 s. v2.1 (the same day, its
  review's fixes): the hold rows' game units by GetWorldScaleInverse's float
  (187407; v2 read GetWorldScale's, 188105, the inverse, and fell back to
  1), trusted only when the two multiply to 1, each row labelled with its
  units; the walk counts every body of the grabbed 3D (BODIES_MAX bounds
  only the printed list). v2.2: without the scale the game-unit fields
  print null (no fallback to 1), the raw Havok values beside them.
- prop-sleep.js: the engine's own sleep of a prop against the client's
  500 ms stir test (docs/engine/havok-props.md row E10; prop-physics.md A3,
  A4). Finds the clutter bodies the player's capsule touches through
  prop-contact.js's two hooks and polls each every 100 ms: motion type,
  speed, hkpMotion's deactivationIntegrateCounter and
  deactivationNumInactiveFrames (5 frames deactivate, hkpMotion.h:23), the
  island's isInActiveIslandsArray and activeMark bits (hkpSimulationIsland.h
  +0x32), emitted on change and once a second while awake. Expected on the
  simulating seat: the frames reach 5 and the island leaves the active array
  within one sample interval of the seat's "stream ... asleep" line; the
  non-owner's Keyframed copy reads type 4. Written 2026-11-03; never run. v2
  (2026-11-11, x-prop-engine v1): the poll runs once a game frame inside the
  player's own update instead of on a 100 ms timer on Frida's thread, each
  row with its frame, the change key on the thresholds (an awake body every
  15 frames besides); the ready row's pid, base, Main's thread and first
  bytes, a liveness row every 10 s. E10's verdict waits for ADR-071's cap.
- prop-launch.js: prop-contact.js plus the body's motion at each contact and before and after every impulse push (the hkpEntity's
  embedded motion: type, position, linear velocity and its length, angular speed, inverse mass; offsets from hkpEntity.h, hkpMotion.h,
  hkMotionState.h, hkTransform.h), for D73's open item: a resting Dynamic basket thrown out of reach by a standing capsule contact (push
  v13 034316, pass v11 034648). Armed on the host seat at a relaunch by x-prop-launch; read against an engine-native basket (the game's
  own console placeatme) in the same run. A launch reads as a jump in vel per push (the push's impulse), a huge massInv (a wrong mass
  after the Dynamic set) or vel growing between pushes (something else moving it). The field offsets are HYPOTHESES until the native
  basket's lines read sane (massInv about 0.3 to 1, a nudge's speed under 100). 2026-10-30.
- prop-impulse.js: ADR-071 rung 0's impulse read (docs/research/physics-leg-2026-11-11.md H2, H3, H4): which engine call pushes a
  prop at a spell's or a shout's impact and what names its cause. TESHavokUtilities::AddExplosionImpulse (26005) and
  ScaleGameplayImpulseForce (26004) are replaced by pass-throughs of their CommonLibSSE-NG signatures, so the forces in xmm2 and xmm0
  print (REPLACE false attaches them instead, no force); bhkRigidBody::SetLinearImpulse (78091) is attached. Each row carries the
  body's reference, its motion facts before and after, the HitData's handles resolved, the thread against Main's, and the innermost
  bracket on its thread: Explosion's Update and FindTargets (209940's slots 0xA3, 0xA4) and every projectile class's ProcessImpacts
  (slot 0xAC; AddImpact, 0xBD, a row per impact). For POLL_MS (2000) after each call, every named body and its island's members are
  sampled once a game frame inside the player's own update (rock-motion-trace.js v1.2's idiom): velocity (the body's +0x230, in
  game units by GetWorldScaleInverse's float, 187407, used only when GetWorldScale's, 188105, is its inverse; the raw Havok vector
  beside it), motion type, the deactivation counters, the island's pointer, size and active bit, its members by reference on change.
  Run on both seats through x-prop-blast v3: the caster's rows read H2, the watcher's H3, the island rows H4. The originals run under
  exceptions 'propagate'; the replacements are reverted after TTL_S (1800) from Frida's own thread, and until then a second
  instance on the same game falls back to attaching 26005 and 26004 with no forces: relaunch the seat before a rerun inside the
  half hour. Ids by `just addr`, 2026-11-11; 1.6.1170 only. Written 2026-11-11, v1.1 the same day (its review's fixes); never run.
- body-impose.js: ADR-071 rung 0's pose read on one seat (H6): can the engine hold a dead body in a pose it is handed, within 32
  units a bone. It finds FORM's actor in the process lists, waits for its body to rest, captures each body's position and rotation
  (bhkRigidBody slots 0x33, 0x34) and the Havok block by the engine's own serializer (36016, the copy freed), then, each time the
  probe has shouted the body away and it rests again: path A, every animation graph's BSIRagdollDriver::SetMotionType(kKeyframed)
  and ten writes 100 ms apart toward the capture (slots 0x36, 0x35), a 3 s hold, Dynamic again and 3 s more; path B, the block
  copied onto the engine heap, the reference's location and angle set back, and the re-apply route 36014 (19535 on the live 3D,
  its 19538 and slot 0x35 and 0x36 calls counted). Pose rows carry the per-bone error against the capture in game units (max, mean,
  the root's, the worst three bones) and the motion types, the rotation error at each window's end. Its engine calls run inside a
  replacement of the player's own update, never inside a listener (the listener guard), on Main's thread alone (a 'thread' row if
  the update runs elsewhere), and the replacement is reverted when the run ends. Its writes, a lab experiment's, never a
  resident's: path A's body transforms and the driver's motion type (set back to kDynamic at its release and by any finish while
  keyframed); path B's block through 36014, and the reference's data.angle and data.location written directly in memory to the
  capture's values and NOT restored afterwards, so the body's record moves with the host's next samples. v1.1 (the same day, its
  review's fixes): game units by GetWorldScaleInverse's float (187407; v1 read GetWorldScale's, 188105, the inverse), the original
  under exceptions 'propagate', the graphs re-resolved at every driver call, the walk counting every body so H6's 64 can fail,
  slots 0x35 and 0x36 counted on bhkRigidBodyT (239275) too, and the pose errors read memory against memory while the writes go
  accessor to accessor (bhkRigidBodyT overrides GetPosition and SetPosition). v1.2 (its re-review's fix): path B's setPos and
  setRot totals count at bhkRigidBody's sites alone, since each bhkRigidBodyT setter ends in bhkRigidBody's own (a T SetPosition
  skips it only for a null hkpRigidBody, which moves no body), so each write that moves a body counts once against 19538's; the
  bhkRigidBodyT sites' labels are the breakdown, not added to the totals. 36014, 36016, 19535 and 19538 are the static
  read's (HYPOTHESIS); the rest by `just addr` and CommonLibSSE-NG, 2026-11-11. Written 2026-11-11, never run.
- save-havok.js: ADR-071 rung 0's save read (the plan's "the kHavokMoved block keeps an awake body's velocities"): at a save, the
  Havok block writer 19534 (its bytes the save buffer's between its entry and leave positions, BGSSaveGameBuffer.h:30-32) sliced per
  body by 19537's entry and leave, each slice decoded by its length (position and rotation, the body flag byte, six velocity floats
  when active, in game units by the static read); at the load, the reader 19535 as a bracket per thread with its 19538 count and the
  vectors bhkRigidBody::SetLinearVelocity (78089) and SetAngularVelocity (78090) take inside it, in Havok units and times
  GetWorldScaleInverse's float (187407, v1.1; v1 read GetWorldScale's, 188105, the inverse, so its game columns were null), trusted
  only when the two floats multiply to 1: a linear row's game column, an angular row's scaled one (rad/s is no length, v1.2); a
  setter outside any 19535 prints its caller (the first 32). FORM names the rolling body; another reference prints
  only when its block holds an active body's velocities. Attach only, no engine call. Run on a seat that saves and loads (a solo run,
  x-quit-solo's frame). 19534, 19535, 19537 and 19538 are the adr065 static read's (HYPOTHESIS); 78089 and 78090 CommonLibSSE-NG's;
  ids by `just addr`, 2026-11-11. Written 2026-11-11, never run.
- cloak-hostile.js: whether a hostile creature's engine counts the player as
  hostile before any blow (docs/verbs/npc-stream.md slice 6, H-53h). Hooks
  Actor::IsHostileToActor and logs self, other, the answer and the caller's
  RVA for every call involving the player (or `ACTOR`), first sight and each
  flip per (self, other, caller), with a summary every ten seconds; `ALL`
  keeps every call (capped), `BT` adds in-module backtraces to the first
  sixteen. Read the (atronach, player) answer against c1's first bolt hit: 1
  before it is a vanilla limit to declare, 0 until it confirms the server's
  rule. Run on the host seat through x-cloak-hostile (the creature caster's
  frame). Address Library id by `just addr`, 1.6.1170 only.
- dontmove-trace.js: the hold finding (docs/verbs/npc-talk.md, Dynamic plan,
  "The hold on 3o-win"): for one actor (ACTOR, default Sven 0x13491) it logs
  the Papyrus SetDontMove call and the engine's Actor_SetDontMove, every
  Actor::SetLifeState write with its caller's RVA (the hold is lifeState 9 at
  Actor+0xC8), Resurrect (the one writer that clears it unconditionally),
  Actor::Move per step with the position and which controller branch it took
  (78276 zero velocity under the hold, 78275 normal), the two stop calls and the
  movement step's entries; a flip row at every lifeState change and a row a
  second. Armed by x-npc-hold v4's relaunch on the host seat. Read: a write of
  9 at the call, every Move on the zero branch after it and a flat position say
  the hold works; a write of 0 from a caller other than 37489 while held names
  the clearer; no write at all says the call never reached the engine. Address
  Library ids by `just addr`, 1.6.1170 only.
- skill-use.js: what the engine hands its skill experience path (thuum
  docs/verbs/leveling.md, M5). Hooks PlayerCharacter::AddSkillExperience
  (Address Library 40488 on 1.6.1170; CommonLibSSE-NG's RELOCATION_ID(39413,
  40488)) and, from the first call's `this`, the player's UseSkill through
  its vtable slot 0xF7 (Actor.h:445); each call prints the skill (ActorValue),
  the float (the points or the experience) and the form. Decides where the
  leveling client hook goes: UseSkill's points if AddSkillExperience reads a
  zero under skymp5-client's zeroed mults, else AddSkillExperience itself with
  the engine's write cut. Probe x-skill-use-read (by path).

## lockpick-trace.js

The Lockpicking Menu's runtime data per frame while the lab drives the minigame (docs/verbs/locks.md, Dynamic plan; written
11:07 PDT 2026-10-31 after x-lockpick v4's silent red): hooks IMenu slots 04 ProcessMessage and 05 AdvanceMovie read from
VTABLE_LockpickingMenu[0] (Address Library 215604 by `just addr`), reads RUNTIME_DATA at this+0x48 (pickAngle, lockAngle, the
break timer, sweetSpotAngle, partialPickAngle, numBrokenPicks; LockpickingMenu.h). Rows on every half-degree move of the pick or
the lock, every broken pick, every message, and once a second. With `params: {SNAP: true}` it writes the pick's angle to the
sweet spot every frame, so a held A opens the lock by the engine's own minigame (the lab's lever for the pick leg, HYPOTHESIS
until its first run). `frida {script: lockpick-trace.js}` on the picking seat before the activation.
v2 (11:49 PDT): hooks the menu's MenuEventHandler slots (CanProcess, ProcessMouseMove, ProcessButton through VTABLE_LockpickingMenu[1],
Address Library 215606) and rows every event that reaches them (device, type, user event, id code, value or held seconds or x and
y, the handler's answer), after x-lockpick v6 (183903) read the pick and lock angles flat at 0 through 27 lab attempts; and a TURN
lever (`params: {SNAP: true, TURN: true}`, TURN_DEG 1.0 a frame from TURN_START_MS 8000 after the menu's first frame, sign
TURN_SIGN) that ramps lockAngle with the pick snapped: HYPOTHESIS that the menu's update opens the lock at its full turn.

- trap-hit-trace.js: who damages a figure when a trap fires (docs/verbs/traps.md,
  ADR-059 decision 4's Dynamic plan; written 14:46 PST 2026-11-01). Replaces slot 06 of
  the three ActorValueOwner vtables (RestoreActorValue: modifier, actor value,
  amount) and prints each Health change on the player or a figure with the
  health before and after and the stack, plus every Actor::DamageActor naming
  one of ours, so the Papyrus path (TrapHitBase's DamageActorValue) and the
  melee path are told apart. Run on the seat hosting Bleak Falls Temple before
  the guest steps on the plate (x-object-anim v3's leg B). 1.6.1170 only.

- pillar-anim-trace.js: which engine family animates a world object (docs/verbs/traps.md,
  ADR-059 decision 3; written 21:4x PST 2026-11-01 after x-object-anim v3 read the puzzle
  pillar silent under the platform's NotifyAnimationGraph hook while the wall and the plate
  spoke through it). Attaches to TESObjectREFR::PlayAnimation_Impl (CommonLibSSE-NG
  Offsets.h:546, AE 14297: the NiControllerManager sequences, their names) and to the
  platform's SendAnimation target (game/Offsets.h, AE 38048: the behavior-graph events) and
  prints every call on a non-actor reference with the stack. Run on the seat hosting Bleak
  Falls Temple before the host turns a pillar (x-object-anim v4's leg C). 1.6.1170 only.

- trap-path-trace.js: the engine's path from a trap's swing to a figure's damage on the
  hosting seat (docs/verbs/traps.md, ADR-059 decision 4; written 21:5x PST 2026-11-01 from
  the re-analyst's static read, HYPOTHESIS until it runs). Attaches to the ProcessTrapHit
  native's callback (56212: R8 target, R9 trap, [RSP+0x28] damage), Actor::DoTrap1 (37509),
  Actor::ProcessHitVictim (38586) and Actor::DamageActor (37335) and prints every call
  naming the player or a figure with its numbers, thread and stack. Expected per swing: one
  processTrapHit, one doTrap1, two processHitVictim, one damageActor with no attacker. Run on
  the seat hosting Bleak Falls Temple before the guest steps on the plate (x-trap-path).
  v2 (22:08 PST 2026-11-01): the native's and DoTrap1's rows unfiltered (any target) and the engine's
  TESTrapHitEvent dispatch (26104) hooked, after v1's run 20261102-055845 printed no row for the
  figure the wall swung at; x-trap-path v2 lets the host's own body take the blade first, so the
  player's rows prove the hooks and the figure's silence places the miss. v3 (05:16 PST 2026-11-02): proves
  itself after x-trap-path v3 (130725) landed its liveness swing twice on the server with no row: the ready row carries the
  process id, the module base and each hook's resolved address with its first eight bytes; every hook counts every call before
  its filter; kernel32!Sleep is counted as a call the process makes constantly; a liveness row every ten seconds carries the
  counts. 1.6.1170 only.

- container-menu.js: the open ContainerMenu's own path on both seats
  (docs/engine/containers.md section 4, read R1 with R4's counters; rows
  E6, E8 to E11, E13, E14, E16, E19 to E24, E26, E27, E32). Hooks
  ContainerMenu::ProcessMessage (51126: the message's type, type 8's
  inventoryRef and updateObj against the 405962 and 403520 statics, the
  dirty set's size, the ItemList's row count and unk50), the rebuild
  (UpdateItemList 51144, full or incremental, and the dirty pass 51146;
  each row's objDesc, object and first extra list at the leave, printed
  when it changed), SendInventoryUpdateMessage (52849: owner, object,
  caller, UI's counters, the take-all byte 406594 and how many messages
  it posted), UIMessageQueue::AddMessage (13631), the message-data
  factory (35855, 52803), RemoveItem and AddObjectToContainer for
  TESObjectREFR and Actor (19689, 37797, 19708, 37525) with the
  InventoryChanges remove and add under them (16059, 16053) for the
  chest (CHEST, default 0x371e9), the menu's target, the player and the
  figures, ItemList::Update_Impl (51031), GetSelectedItem (51017),
  FxDelegate::Callback (82641: the menu's Flash callbacks and their
  arguments) and UI::ProcessMessages (82082: every row names the pass it
  ran in). The ready row carries the pid, each hook's address with its
  live first bytes against Ghidra's image, the vtable slots against the
  hooks (Skyrim Souls RE's slot 04 reads as its own) and a self-test of
  403520 as the player's handle; a liveness row every 10 s carries every
  hook's count before its filter and a kernel32 Sleep pulse; caps per
  hook and in all, and a byte budget, keep the .log small. Arm on both
  seats after the connects, `wait: 15` before the moves
  (x-shared-chest-phantom's frame). Ids by `just addr`, each equal to
  the doc's RVA; argument layouts beyond CommonLib's from Ghidra
  (2026-11-03), HYPOTHESIS. Written 2026-11-03; never run. 1.6.1170 only.

- equip-queue-trace.js: the AI process's equip queue against the inventory
  removals (docs/verbs/npc-fate.md 1c, THE READ of c1's three crashes on
  18531 and the fix 802842d9). Hooks the queue flush 39814, the node
  allocator 39821, the purge 39822, ActorEquipManager::EquipObject 38894
  and UnequipObject 38901 (actor, object, list, count, the queue, force,
  sounds and applyNow bytes), TESObjectREFR::RemoveItem 19689 and Actor::
  RemoveItem 37797 (this, item, count, reason, the list passed), the entry
  deleter 16059 and the actor-update job body 41381; keeps every list a
  node took, a removal named or the deleter freed, and prints `fault:
  true` on an equip or unequip whose list a node took and a removal or
  free consumed (the use-after-free), `queued: true` on a removal whose
  list a node holds (the fix's purge match). Params refs (the actors) and
  cap; a summary every 5 s. Arm between a seat's relaunch and its connect
  into Bleak Falls (lab/.cache/probes/x-fate-login-bleak-trace.yaml). Ids
  by `just addr` on 2026-11-04; names the re-analyst's static read
  (HYPOTHESIS) or CommonLib's. Written 2026-11-04; never run. 1.6.1170 only.

- arrows-apply-trace.js: a change-form record's attached-arrows block
  against the copy's own arrows under the apply (docs/verbs/change-form.md
  READ 8, the applying seat's crash of x-fate-dress-bleak v8 183635 and the
  fix f4014f39). Hooks the apply 35568 (a window per listed form, on its
  thread), ExtraDataList::LoadGame 12095, Actor::Set3D 37178 (a null node
  flagged), RemoveByType 11577 (type 0x98 flagged), GetByType 12329 (0x98's
  leave, found or null) and the attached-arrows loader 12782 (a null extra
  flagged). Params refs (the forms whose applies open a window) and cap; a
  summary every 5 s. Arm on the watcher before the kill
  (lab/.cache/probes/x-corpse-arrows.yaml). Ids by `just addr` on
  2026-11-04; names the re-analyst's static read (HYPOTHESIS) or
  CommonLib's. Written 2026-11-04; never run. 1.6.1170 only.
- reroll-main-trace.js: the living re-roll's 3D work against the main thread's
  deferred DetachHavok (docs/verbs/npc-fate.md THE RAGDOLL CRASH READ; c1-crash-
  2026-11-04-12-30-04 in x-fate-inventory 20261104-202729). Twenty-seven hooks by
  `just addr`: the re-roll 37323 opens a window on its thread for a listed actor
  (refs), TESObjectREFR::Set3D 19730 with its null node, ShouldUseTaskQueue 39033's
  answer, the deferred tasks 36933 and 36939 and the queue push 36993, Load3D
  37177 and 19727 (whose leave closes the window), the root bind 20103, 63357,
  63596, 63792, 78423, 78507 and the collector 78536 (the body's constraints array
  printed element by element with an in-exe flag, the dump's shape), DetachHavok
  37307 with Get3D2 through vtable slot 0x70 and a `race` flag when it runs on
  Main's thread while a window is open elsewhere, a lifetime ring (68170, 78066,
  79805, 79806, 79807, 79810, 77864, 77883) logged on any thread while a window is
  open, InitLeveledItems 16129, and NativeFunctionBase::Call 104651 once per thread
  to name the VM thread; the ready line reads Main's thread from its singleton
  (403449, threadID at +0x28). Params: refs, cap, elements. Expected before fork
  m3-canon-4-reroll-main cc5c82b6: the re-roll and the chain on the VM thread,
  shouldQueue true, a deferDetach, and on a near miss detachHavok on Main with a
  non-null get3D2 inside the window; after it: the re-roll on Main's thread, no
  deferral.
- say-verdict.js: why a relayed voice line's say on a WATCHER seat's puppet ends
  "refused" instead of started, played or inaudible (docs/private/scripts-arm-
  scope.md's B3; docs/verbs/npc-stream.md). Attach to the watcher's game, filtered
  to the speaker FORM: one `say` row per SayTopic 39162 call, with the high-process
  stage 39642's entry, branch and return, the busy test 37266, whether the picker
  25541 ran and walked conditions (25544, TESCondition::IsTrue 29888 and the item
  evaluator 29924), the play 39643 with the voice-file start 39772 or the sound
  path 39771, and SpeakSoundFunction 37542's audibility gate inputs against the
  audio listener (67710 per axis); the verdict word computed as PuppetApi.cpp
  computes it, printed as `say <actor> info <info> -> <word>` beside VoiceService's
  console line. Outside a window: infoEvent rows (25616), clearGreetTopic rows
  (39334 with the caller's module), UpdateVoiceTimer 37752 counts, a liveness row
  every 10 s, a summary at TTL per verdict and refusing branch. LAB_PARAMS: FORM
  (hex, required), TTL (default 600), VERBOSE, ITEMS. Attach only. Ids by `just
  addr`; the branch reading is the re-analyst's static read of 2026-11-03
  (HYPOTHESIS until a run). sha1 a710d784; fresh review GO with its notes applied;
  never run yet. 1.6.1170 only.
- native-frame.js: the frame NativeFunctionBase::Call holds for a script's own
  native call, the read that opens rung 2 of the scripting ladder (docs/research/
  scripts-one-system-2026-11-05.md 6.2, 6.9 and 6.11 items 3, 9, 11 and 17;
  ADR-068 decision 2; lab/.cache/probes/x-native-frame.yaml v1). Attach only, no
  engine call from a listener. Call 104651 in JavaScript: every native counted
  by Class.Name and per thread, a summary every 10 s with calls per second per
  thread, the top 20 natives, every native whose subject is REF and the callers
  outside SkyrimSE.exe; a full `call` row for ObjectReference.PlayAnimation,
  PlayAnimationAndWait and Debug.SendAnimationEvent on REF with the native's own
  members (name, class, latent, the parameter table, the callback at +0x50
  against 56205 and 56206), the Stack (id, state, frames, callback), the top
  frame (owningFunction against `this`, owningObjectType, self, size, the args
  at +0x40 + 16 i decoded by TypeInfo), the previous frame (the calling script's
  type, function and state; a ScriptFunction by its vtable, 252888) and, at the
  leave, the CallResult and the Stack's state and returnValue (H-F1).
  Stack::GetStackFrameVariable 104484 is hooked through a CModule, never called:
  it is also the interpreter's local-operand fetch (105216, 105217), so a
  JavaScript listener there would run for every Papyrus instruction; its answers
  are kept per open Call window and compared with the frame read (`args agree
  yes|no|partial|unread`, `same slot`); the JavaScript fallback detaches itself
  past GETVAR_CAP calls in 10 s. Main's thread from 403449; a kernel32!Sleep
  pulse. LAB_PARAMS: REF (default 0xaa8cb), TTL (600), ALL (false), GETVAR
  (auto, cmodule, js or off), GETVAR_CAP (20000), ROWS (200). Expected on the
  host's three turns of 0xaa8cb: three rows `call
  ObjectReference.PlayAnimationAndWait on aa8cb args Trigger0N Turned0N from
  defaultPuzzlePillarScript.<function> ... frame own yes args agree yes ... ret
  2 kInProgress caller vm` for N 1, 2 and 3, the Trigger02 row being H-W1's
  answer. Ids by `just addr` on 2026-11-05; layouts CommonLib's (file:line in
  the header); Call's body and 104484's callers are pyghidra-mcp's static read
  of the same day (HYPOTHESIS). v1 (sha1 a09f21a9) ran once, x-native-frame
  20261105-023520 on 83a40da3: both hooks attached on the right process, the
  CModule compiled, no call row was written (its sized string read never
  matched a name), and the per-interval counts showed one PlayAnimationAndWait
  on 0xaa8cb per turn, the whale turn included, where the old graph hook
  reported Trigger01 and Trigger03 alone; Call ran about 5,400 a second on six
  VM worker threads, 98.7% of it the platform's own. v2 reads each name to its
  NUL. 1.6.1170 only.
- lever-furn-trace.js: what a player's pull of Bleak Falls Temple's puzzle lever 0xaa8c3
  (FURN 0xb7db4 LeverPushAnimatingNoPlayer) does on the puller's seat and on the seat
  that watches (docs/verbs/traps.md H-P1, the NoPlayer furniture; the static read
  lab/.cache/drafts/fifty/lever-furn-static.md, the probe lab/.cache/drafts/fifty/
  x-lever-furn.yaml, both in the thuum checkout). Attach only: TESObjectREFR::ActivateRef
  19796 (the activator, a_defaultProcessingOnly and the lever's kBlockActivate),
  TESFurniture::Activate 17420 (slot 0x37 of VTABLE_TESFurniture[0] 189309, checked live)
  with the activator's sitSleepState, occupiedFurniture and furnitureIdle before and after,
  the player's furniture use 40486 (expected silent for this keyword), the idle tree's pick
  24602 for a lever source (the action, animEvent and the idle), every
  IAnimationGraphManagerHolder::NotifyAnimationGraph 32901 to the lever with a backtrace and
  to the player or a figure inside a lever window or within windowMs of one (the rest
  counted per actor and event in the liveness row), the lever graph's own events back
  through TESObjectREFR's BSAnimationGraphEvent sink 20102, and NativeFunctionBase::Call
  104651 for natives on the lever or called from defaultPillarPuzzleLever. The ready row
  carries the pid, each hook's live first bytes against Ghidra's, the vtable slot checks,
  *(401069) against the player and the first bytes of the actor holders' slot-1 thunk
  38048 (the platform's SendAnimation id, a JMP to 32901: H-LF6 reads whether the
  platform's hook sits on 32901). LAB_PARAMS: refs, scripts, actorRows, windowMs, cap, bt,
  natives. Ids by `just addr` on 2026-11-06; the roles past CommonLib are pyghidra-mcp's
  static read of the same day (HYPOTHESIS). Written 2026-11-06; never run. 1.6.1170 only.
- trigger-entry-trace.js: who the engine says entered a trigger, on one seat (ADR-068's D-W1 A and
  D-C2 A, the engine read before the build; lab/.cache/drafts/fifty/trigger-entry-static.md and the
  probe x-trigger-entry by path). Hooks the VM's SendEvent (104800) beside Skyrim Platform's gate and
  keeps OnTriggerEnter and OnTriggerLeave alone (the name filtered in the hook): the receiving
  handle, the actionRef read from the engine's own argument object (vtable 217161,
  `anonymous namespace'::SingleObjectRefrHandleArgument, +0x08, never by calling its packer), its
  form id, type, base, cell, position and life state; DispatchMethodCall1 (104804) inside that call,
  so each attached script's class, state and the name the gate passed on ('' is its blank); the
  argument's own packer (its vtable's slot 01), so the akActionRef the script receives; and the two
  SkyrimVM trigger sinks (vtables 217143 and 217145), so every row names the event as raised. The
  ready row checks the VM's slots 0x24 and 0x27, the argument class's RTTI (397003) and the sinks'
  subobject offsets, and prints Main's thread and bhkCollisionFilter's triggerField (400562 +0x3D0)
  with its layer names. Reads only, no engine call; a liveness row every 10 s with every hook's
  count before its filter, a kernel32!Sleep pulse and emptyNames (above 0 says the hook runs after
  the gate). Ids by `just addr`; the event and argument layouts are Ghidra's static read
  (HYPOTHESIS until a run's rows agree). Written 2026-11-07; never run. 1.6.1170 only.
- corpse-lay-heap.js: an ActorMediator sink add or remove against the engine heap's recent frees
  through a corpse lay on a loaded leveled actor, for playtest 49's c1 crash (2026-11-06
  22:20:47 PST: 70199+0x7 on the background loader cloning draugr 0x380b8's skeleton 54 ms after
  c1 laid its corpse record, RCX VTABLE_ActorMediator; docs/private/playtest-49-c1-crash/) and
  the re-analyst's static read of the same night (candidate (c): the lay's Set3D(nullptr) races
  the engine's background reload, a mediator add or remove writes the singleton's address into a
  freed sink array, a pool hands out the singleton's storage 504076). The heap side is a
  CModule: MemoryManager::Allocate 68115, Reallocate 68116 and Deallocate 68117 keep a size
  table, a free record (each block's last free, marked reused at its next allocation) and a ring
  of the last 65,536 frees, with no row per call; BSTEventSource AddEventSink 20140 and
  RemoveEventSink 38402 reach JavaScript only for the mediator's sink or a source whose arrays,
  self or graph are freed. Rows: sinkAdd and sinkRemove with the thread (main or not), the three
  arrays, notifying, the lock, the graph's holder and `fault: true` on a freed one; alloc with
  `poisoned: true` when 68115 or 68116 returns the storage or VTABLE_ActorMediator 207706 and
  `poisonedLink: true` when a handed-out block's first qword names either, each with a stack
  scan; apply (35568), load3D (37177) and set3D (37178) stamps for the forms in refs (default
  0x380b8) with their windows; a layWindow tally one second after each watched apply; exception
  per first-chance fault; liveness every 10 s with each hook's count before its filter and a
  kernel32!Sleep pulse. A critical row holds its thread flushMs (600) so the preamble's 250 ms
  flush writes it before a crash. LAB_PARAMS: refs, cap, ttl, flushMs. Arm on the applying seat
  before the kill (lab/.cache/drafts/fifty/x-corpse-lay-crash.yaml by path). Ids by `just addr`
  on 2026-11-06; layouts CommonLib's (file:line in the header); the roles the report's static
  read (HYPOTHESIS). Written 2026-11-06; never run. 1.6.1170 only.
- acting-frame.js: whom a fragment's Game.GetPlayer() names on a seat that applies a relayed quest stage, and what that call's
  stack holds at its root (ADR-068 rung 5's H-AP1; docs/research/rung5-quests-2026-11-09.md section 2; the probe
  x-acting-frame by path, lab/.cache/drafts/rung5). native-frame.js's attach on NativeFunctionBase::Call (104651, `just addr`
  0x143dc00), filtered to Game.GetPlayer by the bound IFunction's own class and name; per hit, the stack's root frame (its
  owningObjectType's name, owningFunction's name, self's handle kind, mid and low 32 bits) walked through previousFrame, and the
  returnValue after the call. A root whose self is the watched quest (LAB_PARAMS QUEST, default 0x74a83) or whose script ends in
  the quest's QF suffix prints as a quest row (ownScript true with quest false reads H-AP1 false); platform calls past PROWS are
  counted (platformQuiet) and skip the walk. Reads only, no engine call from a listener; a liveness row with a kernel32!Sleep
  pulse. Layouts CommonLib b93280e8's (Stack.h, StackFrame.h, Variable.h, ObjectTypeInfo.h, Object.h; file:line in the header).
  Fresh-reviewed 2026-11-09 (GO WITH NOTES, the notes applied as written); never run. 1.6.1170 only.
- additem-functor.js: whether a script's AddItem of a leveled list on its own player lands through a container event fired
  synchronously inside SkyrimScript::AddItemFunctor's operator() on its thread, carrying the stack id the platform's seam recorded
  at the call (ADR-068 rung 5, Eli's D-R1 C and its named gap: fork m4-scripts-5-rewards 1bc4059b refuses a leveled list by name,
  E_SCRIPTCALL_LEVELED, because the engine rolls it later, in the functor). The probe x-additem-functor by path
  (lab/.cache/drafts/rung5) sets MS01's stages 39 and 49, each a fragment's AddItem of LvlQuestReward02Medium 0xc0405 on the
  player, and FreeformStonehillsA's 20, Gold001 x25, the control. Hooks: native-frame.js's NativeFunctionBase::Call (104651, `just
  addr` 0x143dc00), filtered to ObjectReference.AddItem and Activate by the bound IFunction's own class and name; AddItemFunctor's
  operator() at the address its live vtable's slot 01 holds (218372; the locator checked against RTTI 397281, slots 00 to 06
  printed, slot 01 against the static read's 56095); the VM's container sink (SkyrimVM 400475 +0x48, slot 01 ProcessEvent, RTTI
  396984) and Skyrim Platform's, found in the event source's sink array at the VM sink's first event and attached 500 ms later
  from Frida's own thread. A sink call whose `this` is not the registered sink counts as foreign and reads nothing. Rows: ready
  (pid, each site's live first bytes, the locator and slot checks); addItemCall per AddItem (the Stack, the three arguments, the
  caller frame, the CallResult); activateCall for an Activate whose window caught an event; functorEnter and functorLeave
  (stackID, the matched call or a requeued functor's rerun, raw bytes named by value as HYPOTHESIS, a leveled list's live members
  capped at 256 entries and 64 leaves, the sret reading a detour needs: rax against the entry's rdx); event per container event
  naming the player or fired in a window (the window, member, listItself, paired across the two sinks); sinks and platformSink
  once; a summary every 10 s with every hook's count before its filter and the pending calls; final and detached at TTL.
  Backtraces go only to functors matched to a call on PLAYER and to their events. Reads only, no engine call from a listener; a
  kernel32!Sleep pulse. LAB_PARAMS: TTL (default 600; the probe passes 100 so final lands before the run's fetch), ROWS (64),
  EVENT_ROWS (200), BT (3), RAW (0x28), PLAYER (0x14). Ids by `just addr` on 2026-11-10; layouts CommonLib b93280e8's (file:line
  in the header). Fresh-reviewed 2026-11-10 (runs as is, its notes all NOTE; notes 1 to 6 and 8 applied, 7 and 9 optional and
  left); never run. 1.6.1170 only.
