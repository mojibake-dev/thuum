# Verb: trigger-entry

Drafted 2026-11-07 (PST morning, the r50 lab layer) from docs/VERB.md and the build plan
docs/research/fifty-fixes-2026-11-07.md (against fork m4-scripts-4-rows 42f40f84; the fifty train is m4-scripts-4-rows 1acb834f
plus its 4c and 4d layers), with the static read beside the premise probe (lab/.cache/drafts/fifty/trigger-entry-static.md,
gitignored; its findings are carried here with their sources). ADR-068's D-W1 A and D-C2 A (docs/DECISIONS.md, "D-W1 and D-C2",
Eli 23:1x PST 2026-11-06), and D-W2 A (docs/DECISIONS.md, "D-W2 A and D-C3 A", Eli 02:2x PST 2026-11-07, thuum 2774cfb4; the
plan's section 7), whose section below this doc's template sections carries the trigger's own look and Eli's condition on it.
Sections 1 to 5 of the plan are built on fork m4-train-50 b5e466a2 and D-W2's S5, P3 and C4 are not; nothing here ran on the lab:
every engine fact below is HYPOTHESIS until the read named beside it, and every Status box is open.

## Intent

A trigger volume's entry counts once, on its presser's owner, and travels to the trigger script's owner: a pressure plate one
player steps on fires its trap on every screen once, from that player's own seat, and a guest walking through a cobweb tears it on
every screen through the cell host's copy of the web's script.

Roadmap reference: skymp/ROADMAP.md "Dungeon support" ("Traps, puzzles and more ... State must be saved on the server")
Milestone: M4   Class: B

## Inventory (ADR-031: the action's consequences, before its rung)

The action is "an actor enters (or leaves) a trigger volume". The reference trace is the premise probe's (x-trigger-entry v1 with
lab/frida/trigger-entry-trace.js, both seats); the records are the triggers' scripts by their pex (lab/pex.py: PressurePlate,
TrapTriggerBase as USSEP ships it, Tripwire, FXtriggerAmbFX) and the XAPR links (lab/esm.py).

| consequence | seen in | disposition |
| --- | --- | --- |
| OnTriggerEnter or OnTriggerLeave to the trigger's scripts with the presser as akActionRef, on the presser's owner's seat | trace (x-trigger-entry, owed) | native: the presser's owner's gate passes it (an owned presser) |
| the same event raised on every other seat for that presser (a figure, a puppet, another seat's NPC or body on its copy) | trace; docs/engine/scripts.md S7 for a figure | suppressed: the gate blanks a press by an actor the seat does not own (D-W1) |
| a trap family trigger's firing: its own activation (Activate(self)) and its first links (XAPR, the spike wall from its plate) | engine, record | native on the presser's owner; the root reported (Activate 6) and relayed (RelayedActivation 70) to every other listener, whose engine fires its own copy's target from the relay |
| a firing's later links (a linker's nine children, Embershard's rocks) | engine, record (docs/research/trap-census-2026-11-05.md rows 16 to 19) | native on each seat from the relayed root; never reported (R3, declared: the plan's read 5) |
| the trigger's own calls on itself during the firing: a PressurePlate's 'Down' and 'Up' and its sound; a Tripwire's SetMotionType on its rope, its sound and 'Trigger'; a SoundTrap's SetMotionType, ApplyHavokImpulse, sound and 'trigger01' | engine, record (the scripts' pex, the plan's section 7.1 read 1) | R2 from the firing seat (D-W2 A; R3 declared before it): its presser's owner owns them during the firing and they cross the seam as look rows (ScriptCall 75's look channel) and play on every other seat (SpSnippet 30); HYPOTHESIS H-LK1 to H-LK4, the section "D-W2 A" below. A single-use trigger's spent state still reaches the watcher as its destruction record (DestructionStage 78) |
| a SoundTrap's CreateDetectionEvent (the bone alarm waking NPCs) and PlaceAtMe(havokNudge) | record (SoundTrap's pex, ops 23 and 15) | the firing seat's alone, not carried (declared, the plan's section 7.6): a guest's alarm wakes no NPC the host simulates, and the watcher's bones take the relayed impulse in place of the nudge |
| a world trigger's script run (the cobwebs' FXtriggerAmbFX) | record | the cell's host's alone (unchanged); a guest's own entry relayed to the host (Activate 6 and RelayedActivation 70 with `entry`), played there by TESModPlatform.SendTriggerEvent with the guest's figure as akActionRef (D-C2) |
| the world script's consequences (the web's SetAnimationVariableFloat, its FX, its sound) | record | ScriptCall 75 from the host, relayed as SpSnippet 30 (rung 2's seam, unchanged) |
| a late joiner's view of a torn web | record | D-C3 A, ACCEPTED (thuum 2774cfb4) and built on b5e466a2: the record's view carries the object's graph variables (papyrus-events.md, "D-C3") |
| OnTrigger, the continuous event | engine | unchanged: the presser rule leaves it alone (the word wall reads it through the sendPapyrusEvent hook, before the gate) |
| a non-actor presser (a prop, a thrown item) | engine | passes on every seat as today, except a trap body another seat streams (TrapFamily::Followed), which is its streamer's |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| one press of the Temple's plate 0x567f2 by the guest, by the host, by an NPC the host simulates (each seat's path) | x-trigger-owner v1, legs A, B, C | |
| the guest through Embershard's tripwire 0xb6d3f: one root crosses, the nine children fire once on each seat | x-trigger-owner v1, leg D | |
| two owners on one plate in turn (c1 on, c2 on, c1 off, c2 off, c1 again) | x-trigger-owner v1, leg M (recorded, H-W2) | |
| a guest's walk into an unfired web, twice (two webs) | x-cobweb-relay v1 | |
| a late joiner to a torn web, after a reload, after a server restart | x-cobweb-view v1, b-cobweb-view v1 (D-C3 A, pending) | |
| the gate set's plate legs under the rule | b-object-anim v6, b-bleak-traps v4 (drafts, Eli first) | |
| the watcher's look: the plate's Down and Up both ways, the guest's tripwire rope (D-W2) | x-trigger-owner v2, legs A, B and D | |
| playtest 49's verified trap items on both seats (Eli's condition on D-W2): the bone alarm from the seat that did not walk in; the tripwire for the host's own trip and for a lured NPC; the wall and the blades killing draugr | x-trap-bone-alarm v1, x-trap-wire-rope v2 (Eli first), x-trap-wire-lure v1, x-trap-wall-kill v1, x-trap-npc-kill-late v1.3 (unchanged); the section "D-W2 A" below | |
| the look in both dungeons, the gate's | b-trap-look v1 (draft) | |
| a login inside a cell with a family trigger (D-L1 B's walk raises no trigger event) | x-login-in-cell v2.1 | |

## Ownership (ADR-063: ownership, not permission)

Owner: the presser's owner. A player is its own seat's; an NPC is its simulator's (the platform's Hosted and not Puppets, the
gate's simulated-actor test); a body is its cell host's (bodies are not props until M4); a trap body is its streamer's
(TrapFamily::Followed). Ownership passes as the presser's does: an NPC's hand-off, a cell's grant for a body.
Channel: Activate 6, the seat's report (a family trigger's root, as today's linked report; a world trigger's entry, with the new
optional field `entry`), and RelayedActivation 70, the server's word to the other seats (the root to every other listener; an
entry to the cell's host alone, with `entry`). No new message: MsgType 81 stays free (the plan's read 3).
Content-specific code: none. The family is TrapFamily.cpp's class chain, the one place it is named; the rule names no trigger,
base or script, and D-S3 phase 2's playerOnlyTrigger read (RecordSetsPlayerOnlyTrigger) is deleted into it (a player-only trigger
is a family trigger fired on its player's own seat).
Two seats: x-trigger-owner v1 (each seat's firing path for each presser), x-cobweb-relay v1 (the guest's web on the host and back),
then b-object-anim v6, b-bleak-traps v4 and b-cobweb-view v1.

## Authority

Rung: R2 for an entry, for a family trigger's root and, since D-W2 A, for the trigger's own look calls during its firing (the
presser's owner's engine computes, the server relays and records nothing); R3, declared, for a firing's later links.
Why this rung (R2 is the default, ADR-063): the server reads no script archive in the lab (a BSA is added only from a settings
`archives` key, ScriptStorageFactory.cpp:48-63, and lab/deploy/sky-srv/server-settings.json has none), so it cannot tell a family
trigger's pair from a mechanism's, nor recompute an entry; the presser's owner's engine is the only oracle.
What the server validates (rule 5), in wire-rules/src/trigger_entry.rs: for a root, firing_source: accepted from the cell's host as
today, or from a game with the cell loaded (PartOne::GetCellLoaders) one of whose actors stands within the trigger's activation
reach plus FIRING_SLACK 512 (UNMEASURED); refused E_TRAP_NOT_HOST (neither host nor loader) or E_TRAP_FAR; the link
(E_TRAP_UNLINKED) and the budget (E_TRAP_RATE) stay the handler's. For an entry: the trigger a world object the server holds or
places by its record and no actor (E_ENTRY_NO_REF, E_ENTRY_ACTOR), the presser the reporter's own actor or one it simulates
(E_ENTRY_PRESSER), the reporter a loader of the cell (E_ENTRY_NOT_LOADER) and not its host (E_ENTRY_HOST), a host present
(E_ENTRY_NO_HOST), the presser within the trigger's activation reach (E_ENTRY_REACH, UNMEASURED: a web's slab is its record's
bounds at scale 1.83, and a trigger box like the Temple's ambush box 0x38098 stands about 1000 units from what it covers, a reach
no read has measured).
A leave pairs with its enter (fork m4-fifty-server 0c760119 and 5b200681, the builder's call on the probe review): one that ends its
presser's own accepted enter into the trigger is taken without the loader and the reach checks (a guest leaving by a teleport or a
door reports it after the move, 1,500 to 2,000 units off, its game perhaps with the cell unloaded), every other check kept; one that
ends none is E_ENTRY_UNPAIRED, before any other check; a host with no game connected is E_ENTRY_NO_HOST. The pairing is runtime only
(64 open enters a presser, UNMEASURED; a disconnect forgets the player's, a restart all). Rule 5: a leave is validated by its
pairing, R2 beyond it.
Rate limit / bounds: the wire's entry_budget, 8 at once then 4 a second per sender (UNMEASURED, E_VAL_RATE); the linked budget, 8
a second (today's); the client's own entry window of 4 a second. Every accepted loader pair is logged with its reporter: a modified
client can fire any linked pair of a cell it has loaded, within the link, the reach and the budget, and relay entries for its own
presser (declared).

## Engine surface

- CommonLibSSE-NG (b93280e8): SkyrimVM's TESTriggerEnterEvent and TESTriggerLeaveEvent sinks (include/RE/S/SkyrimVM.h:130-131),
  their vtables VTABLE_SkyrimVM[44] and [45] (Offsets_VTABLE.h:4307); the argument class's vtable
  VTABLE___SingleObjectRefrHandleArgument (Offsets_VTABLE.h:4309) and its RTTI (Offsets_RTTI.h:4775); IVirtualMachine's SendEvent
  slot 0x24 and DispatchMethodCall1 slot 0x27 (IVirtualMachine.h:89, :92); SkyrimVM::RelayEvent (Offsets.h:487); IFunctionArguments
  (IFunctionArguments.h:17-20); RE::FunctionArguments<Args...> and MakeFunctionArguments (include/RE/F/FunctionArguments.h:27-88),
  whose Variable::Pack of a form goes to PackHandle (src/RE/P/PackUnpack.cpp:48-80); bhkCollisionFilter's triggerField
  (bhkCollisionFilter.h:16, :37) and CollisionLayers.h; TESObjectREFR::IsDead (TESObjectREFR.h:353).
- Address Library (1.6.1170, `just addr`, 2026-11-07): 217143 and 217145 (the two sinks' vtables), 217161 (the argument's
  vtable), 397003 (its RTTI), 104800 (SendEvent), 104804 (DispatchMethodCall1), 54033 (RelayEvent), 400562 (the collision
  filter), 403449 (Main). The sinks' ProcessEvent targets, the packer and its destructor have no id and are read from their
  vtables at runtime by the trace, never hardcoded.
- The path, each step HYPOTHESIS from the decompile until x-trigger-entry's trace reads it (the static read's section 2): the enter
  sink builds `anonymous namespace'::SingleObjectRefrHandleArgument on its own stack with the actionRef at +0x08, its refcount
  raised, then calls SendEvent with the trigger's handle and RelayEvent for its aliases (H-TE1); SendEvent dispatches once per
  attached object, and DispatchMethodCall1 packs the arguments only for an object whose state has the handler, so a blanked name
  packs nothing; TESTrapListener's overlap callback admits a collidable by its collision layer and its reference alone, with no
  player, AI, puppet or life-state test, so a figure, a puppet and a simulated NPC press through their character controllers and
  a body only if its ragdoll's layer is in triggerField (H-TE2). A figure pressing its watcher's copy is CONFIRMED by run
  (docs/engine/scripts.md S7: x-trap-family-fire 20261105-135134), and a carried body's figure fires the other seat's copy one
  relay hop later (S9, CONFIRMED by its log timing, x-trap-wall-both 20261105-220449).
- The scripts, each HYPOTHESIS from its disassembly (ADR-064 decision 1: a disassembly is a hypothesis with a source; the static
  read's sections 5 and 6): PressurePlate and USSEP's TrapTriggerBase accept any actor not in an owning faction (no life-state
  test, and the plate 0x567f2 sets none of playerOnlyTrigger, owningFaction or owningActorBase); PressurePlate's DoNothing state
  refreshes objectsInTrigger from GetTriggerObjectCount on every enter and leave it hears and goes back to Inactive at 0 (H-W2's
  ground); FXtriggerAmbFX's OnTriggerEnter never reads akActionRef and its 48 strings hold no player name, so the host's copy
  tears a web for whoever enters it (H-C2a), once (oneTimeTrigger 1, then broken 2).
- The fork's gate (skyrim-platform FridaHooks.cpp OnSendEventEnter, :261, installed on SendEvent): it reads the handle (arg 1) and
  the name (arg 2), blanks by replacing arg 2 with an empty name, and has never read arg 3, the arguments (upstream's known issue
  #405).

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the platform's SendEvent gate, after its record-death, record-apply and Override returns and the pending blank, for
  an OnTriggerEnter or an OnTriggerLeave (without case) to a world object, with the block on.
- SP filter (rule 9): trigger events alone; one compare of arg 3's first word with RE::VTABLE___SingleObjectRefrHandleArgument[0]
  (resolved once through the platform's Relocation idiom) and one load of the presser at +0x08. An argument of another class
  passes as before, counted, one line a minute.
- Data captured: the presser; for an owned presser on a family trigger, or on a world trigger in a cell this seat does not host,
  the event "triggerEntry" {refrId, presserId, enter, family} through AddTickTask, propContact's shape (FridaHooks.cpp:2236-2243),
  never a synchronous crossing into JavaScript (the plan's read 1).
- Side effects of hooking here: HYPOTHESIS H-TE1 (a wrong offset would load a bad pointer on a VM thread: the exact vtable compare
  guards the class, and the load waits for the trace's pack rows to agree).

## Impose (observers render the server's decision)

- A family trigger's root: RelayedActivation 70 to every listener but the reporter, played as today's relay
  (relayedActivationService.ts, `target.activate(caster, false)` on the update), so each seat's own engine fires the root's target
  and propagates its later links; each play is marked relay-played for FIRED_MS (5000, UNMEASURED) so it is never reported again.
- A world trigger's entry: RelayedActivation 70 with `entry` to the cell's host alone, played as
  `TESModPlatform.SendTriggerEvent(trigger, "OnTriggerEnter" or "OnTriggerLeave", caster)` on the update: SendScriptEvent's body
  (ScriptState.cpp:1376-1452, SendEvent then SkyrimVM::RelayEvent under PlatformCall::Scope) with a
  RE::BSScript::FunctionArguments<void, RE::TESObjectREFR*> holding the figure in place of ZeroFunctionArguments, held on the stack
  (SendEvent consumes its arguments before it returns). The relay is played through callNative under Override, whose gate return
  comes before any read of arg 3 (FridaHooks.cpp:314-324), so the gate never meets the platform's own argument class.
- Visual without simulation achieved by: each seat's own engine and scripts fire from the relay (the wall swings from its own
  TrapSwingingWall); the host's world script's consequences arrive as SpSnippet 30.
- Side effects: HYPOTHESIS H-W3 (FunctionArguments<TESObjectREFR*> packs as the engine's own argument, the receiving script's
  akActionRef the figure); HYPOTHESIS H-C2a (the host's FXtriggerAmbFX tears a web for a relayed entry).

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: a trigger event whose presser this seat does not own (another seat's figure, a puppet, another seat's NPC
  or body), blanked with the line "[verb:traps] <event> to <trigger> by <presser>: not this seat's presser, ignored (D-W1) (<n> so
  far)", the first three and every hundredth (the gate's idiom).
- How: the gate's blank (arg 2 replaced by an empty name), as its other blanks.
- Release condition: the presser's ownership passing (an NPC's hand-off flips Hosted; a cell's grant gives a body to its new
  host). Kill switch: the platform export setTriggerPresserRule(bool) beside GetTrapRole (PuppetApi.cpp), off in the platform by
  default so an older client keeps D-S3, turned on by the client setting triggerPresser (default true; false is the A/B).
- Side effects: HYPOTHESIS H-W2: a plate last left by a presser the gate ignored stays in its DoNothing state until an owned press
  counts again, since its count is refreshed from the engine's, which still holds the ignored presser, and the ignored leave never
  lowers it. The way out the plan named (pass a non-owned leave, so the count stays honest) is ruled out by the pex twice.
  SoundTrap's [DoNothing] OnTriggerLeave goes back to 'active' and fires again on a leave (the plan's section 7.1, read 1(b)). And
  H-W2's own pex read (2026-11-07; the lab's winning copies, USSEP's TrapTriggerBase, sha1 12971d31, and vanilla PressurePlate, sha1
  a0bc199e): with StoredTriggerType 1 ("hold") the last leave fires Activate(self), and the Temple plate 0x567f2 sets none. So a
  non-owned leave stays blanked, and a plate whose last occupant is an ignored presser can lose its owner's next press: OPEN, read
  by x-trigger-owner v2.1's leg M (recorded; lab/.cache/drafts/fifty, 6a17c24f). With D-W2 a watcher's plate follows the last look
  relayed (cosmetic, declared in the plan's section 7.6) whatever its own count holds.

## Message contract

- Message name / numeric type: Activate (MsgType 6) and RelayedActivation (MsgType 70, wire id 78), each with one new optional
  field; no new message.
- Direction: Activate C2S, RelayedActivation S2C.
- Fields: `entry: Option<u8>` on each, 1 OnTriggerEnter and 2 OnTriggerLeave, absent on every activation; on an entry Activate,
  `caster` is the presser (0x14 for the sender's own player, or an actor it simulates) and `target` the trigger.
- Validator rules: check_activate (new; before it Activate fell to the shared arm): with `entry`, 1 or 2, isSecondActivation false,
  caster nonzero and within 32 bits (fork m4-fifty-wire a129da30), target nonzero and below 0xff000000, else E_VAL_RANGE;
  ClientGuard's entry_budget, 8 at once then 4 a second (UNMEASURED, E_VAL_RATE), never spent by an Activate without entry;
  check_relayed_activation: entry absent, 1 or 2. As built: Activate's row stays 64 bytes (24 at the longest) and
  RelayedActivation's goes 16 to 24 (13 at the longest), both pinned by the size tests.
- Idempotency / ordering: an entry is an event, not state: relayed once, kept nowhere; reliable, in order per sender.
- SCHEMA_VERSION 39 to 40, once, with D-C3 A's graph_vars (Eli answered A; both built on fork m4-fifty-wire 547c4876); netcode's
  protocol id carries it, so W1 never stages without the client built from the same tree.
- Fixtures: 06-Activate-2 (c2's own player entering the web 0x37281), 06-Activate-3 (an entry with isSecondActivation true,
  refused), 70-RelayedActivation-2 (the entry to the host, caster 0xff000001), 70-RelayedActivation-3 (entry 3, refused).
- Contract doc updated: yes, 2026-11-07, from fork m4-train-50 4bd07f33's code: docs/WIRE.md's RelayedActivation section (the firing
  source, and Activate's and RelayedActivation's entry with its rule, pairing, refusals, fixtures and the session trigger-entry),
  its ScriptCall section (the look channel; D-W2 adds no field, no message and no bump: ScriptCall 75 carries the look calls,
  SpSnippet 30 their relay, SCHEMA_VERSION stays 40), its ScriptStateApply section (D-C3 A's graph_vars) and its ObjectAnimation
  section (the furniture's owner).

## Server

- Where the logic lives: wire-rules/src/trigger_entry.rs (new: firing_source and entry, through the bridge in the cxx shape of
  ScriptStateFacts); ActionListener.cpp's OnActivate sends an Activate with `entry` to a new OnTriggerEntry first and relays it to
  the host's user alone; its self-activation branch's host test (:2188-2195) and OnLinkedActivation's fromHost and player-only
  block (:4941-4985) become firing_source, NoteTrapFiring kept; the relay to every listener but the reporter (:5002-5016)
  unchanged, so the host plays a guest's root too; RecordSetsPlayerOnlyTrigger and its cache deleted (S2).
- Lines: "[verb:traps] <reporter> reports <presser> entering|leaving <trigger> in cell <c> (its host <h>): relayed to the host";
  "[verb:traps] <trigger> activates <target> in cell <c> (<reporter> reports with the cell loaded, its firing): relayed to <n>
  game(s)" beside today's "(its host <h> reports)" line.
- DB fields / migration: none (an entry records nothing).
- Restart behavior: nothing to restore; a single-use trigger's spent state stays the destruction record's (b-trap-record-restart).
- Papyrus natives touched: TESModPlatform.SendTriggerEvent, client only; its docs/NATIVES.md line (rule 10: R2, papyrus-events)
  written 2026-11-07 from fork m4-fifty-platform df1d130d, beside D-W2's look notes on Sound.Play,
  ObjectReference.CreateDetectionEvent, SetMotionType and ApplyHavokImpulse; the counts are the rows' own tally, missing 1311 and
  total 1473 (one row behind since 8b77f196's uncounted TESModPlatform.ApplyChangeFormResult, now counted).

## Client

- SP binding: setTriggerPresserRule(bool); TESModPlatform.SendTriggerEvent(ObjectReference trigger, String name, ObjectReference
  actionRef) -> String, answering {formId, event, sent, scripts, reason} and refusing a name that is no trigger event, a None
  actionRef or an actor trigger (its .psc line beside SendScriptEvent's, the pex by `lab/pex.py add-native`); the "triggerEntry"
  event in EventManager.cpp, Definitions.txt and skyrimPlatform.ts (all three, or the client build fails).
- TS handler: ActivationService's root rule. The marks: a "triggerEntry" with family and enter marks the trigger pressed here; a
  family trigger's own activation marks it fired here and is reported from this seat, whichever seat it is (any other trigger's
  own activation is the host's, as today). A linked pair is judged in order: (1) the relay's own play, not reported; (2) a caster
  that is a family trigger pressed or fired here within FIRED_MS and not relay-played in that window, reported: the root, whatever
  the target; (3) a later link, not reported: a pair whose caster and target are both in the family (D-S3 point 5's test,
  kept by the train's client review, fork 118b92af note 1, so a mechanism activating a family target, the puzzle lever's darts and
  the pull chains' blades, falls to (4)); (4) otherwise the cell's host's, as today. A "triggerEntry" without family sends Activate
  with `entry` within its own window of 4 a second.
  RelayedActivationService plays an `entry` through SendTriggerEvent and marks every play relay-played for FIRED_MS.
- Lines: "trap <t> fired here by <c>: the presser's owner's firing, reported (D-W1)", "...: the relay's own play, not reported
  again (D-W1)", "...: a later link of a firing, each seat's own (D-W1)", "trigger entry <t> by <p> (enter|leave): relayed to the
  cell's host (D-C2)", "relayed entry <t> by <c>: <answer>".
- Kill switch config key: triggerPresser (default true); with it off, D-S3's branches stand (the A/B), and they retire at the
  switch's removal after playtest 50's T4 close (activationService.ts:80-92, :94-97, :104-118's host test).

## Tests

- T0: TriggerEntryTest (the relay and each refusal), LinkedActivationTest (a loader's family pair accepted and relayed to the host;
  a non-loader's refused; E_TRAP_FAR), the wire-rules crate tests and a proptest for each new validator branch.
- T1: the Windows build (P1).
- T2: difftest's trigger-entry session (a fake guest's entry relayed to the fake host, then E_ENTRY_HOST and E_ENTRY_PRESSER).
- T3 scenario id: lab/scenarios/b-cobweb-view.yaml (D-C2's, a draft in lab/.cache/drafts/fifty until its probes are green; with
  D-C3 A's legs); D-W1's T3 is the gate set's b-object-anim v6 and b-bleak-traps v4 (drafts in the same folder, for Eli).
- Probes (lab/.cache/drafts/fifty, by path): x-trigger-entry v1 (the premise read), x-trigger-owner v1 (D-W1), x-cobweb-relay v1
  (D-C2).
- Assertions that would fail if the verb silently regressed: the watcher's own firing count rising for a figure's press
  (x-trigger-owner claim 2, b-object-anim v6's new A and B claims); the watcher's relay plays not matching the presser's firings
  (claim 3); a relay's play echoed back (claim 4); the root refused (no E_TRAP_ but the ambush box's NO_REF); a rock pair relayed
  or a rock fired twice (claims 11, 12); a guest's web entry not reaching the host's script (x-cobweb-relay claims 1 to 5).

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/trigger-entry-trace.js (thuum branch r50-reads, 45decb9e: every OnTriggerEnter and OnTriggerLeave
  SendEvent on a seat, its actionRef read from +0x08 after the vtable check, what each script got after the gate, the VM's own
  pack read at the packer's leave; no engine call), run on both seats by x-trigger-entry v1 and on the host by x-cobweb-relay v1.
- The hypotheses and the one observation that settles each (the plan's section 4):

| id | claim | the one observation | read by |
| --- | --- | --- | --- |
| H-TE1 | the engine's trigger argument is SingleObjectRefrHandleArgument (217161) with the actionRef at +0x08 | the trace's ready row (argOk, enterSinkOk, leaveSinkOk) and every pack row agreeing, on both seats | x-trigger-entry v1 (premise: P1's gate waits for it) |
| H-TE2 | a figure and a puppet press a non-owner's copy | enter rows naming the figure and the puppet on the watcher | x-trigger-entry v1 (recorded) |
| H-TE3 | the host's engine delivers a guest's figure into the host's web | c1's rows for 0x37281 in leg W1 | x-trigger-entry v1 (recorded; sets x-cobweb-relay's claim 6) |
| H-W1 | the press mark, or the trigger's own activation, reaches the client before its first link | per leg, the trigger's own activation before the pair's O line; no "a later link" for a root | x-trigger-owner v1 (claim 8) |
| H-W2 | a plate last left by an ignored presser stays in DoNothing until an owned press counts again | leg M's second press by c1, fired or not (the pex read is done: a non-owned leave stays blanked, Suppress above) | x-trigger-owner v2.1 (recorded) |
| H-W3 | FunctionArguments<TESObjectREFR*> packs as the engine's own argument | the host's pack row under the relay, agree true, arg0's handle the figure's | x-cobweb-relay v1 (recorded) |
| H-C2a | the host's FXtriggerAmbFX tears a web for a relayed entry | the host's SetAnimationVariableFloat report from FXtriggerAmbFX.OnTriggerEnter, relayed to 1, and its broken 2 | x-cobweb-relay v1 (claims 4 and 5) |

- Breakpoint plan for a human session: none needed while the traces answer.
- Owner: agent (Frida).

## D-W2 A: the trigger's own look from its firing seat (2026-11-07, Eli; the plan's section 7)

Eli's answer, verbatim: "D-W2 A (provided it's not breaking what i verified DOES work, becuase last test did seem to work) and
D-C3 A". The rule: during a firing its presser's owner started, that seat owns the trap family trigger's own calls on itself,
which cross the seam as look rows from the firing seat and play on every other seat; one firing, every screen. Why: under D-W1 A
a watcher ignores a press by an actor it does not own, so its copy of the trigger's script never runs, and that script is what
drops the tripwire's rope and moves the plate; without the look the watcher's rope stays taut and its plate still.

- The calls, per class (HYPOTHESIS from each winning copy's pex, the plan's section 7.1 read 1): Tripwire (USSEP) [Active]
  onBeginState SetMotionType(self, 1, True), TriggerSound.Play(self), Activate(self), PlayAnimation('Trigger'); SoundTrap (USSEP,
  the bone alarms 0x10481e and 0x10481f) [active] SetMotionType(self, 1, True), Activate(self, False), TriggerSound.Play(self),
  PlaceAtMe(havokNudge), CreateDetectionEvent, ApplyHavokImpulse(0, 0, -1, 15), PlayAnimation('trigger01'), and it fires again
  on a leave; PressurePlate (vanilla) [active] Activate(self), TriggerSound.Play(self), PlayAnimation('Down'), then 'Up' on the
  leave that empties it. Two look calls come before the trigger's own activation, so the server judges each look call by its own
  firing facts, never by a window anchored on the firing's report.
- Observe (P3, built: fork m4-fifty-platform 244c9162 and e7f62114): the platform's look window, TrapFamily::Firing, noted by the
  presser rule's owned branch on an enter and on a leave alike for a family reference whose attached script is a trigger's
  (TrapFamily::IsTrigger, e7f62114: an owned actor in TrapSwingingWall's own volume opens no window on the wall) and not exempt,
  open LOOK_MS (10000, UNMEASURED) after the last note; OnFamilyCall's look branch queues a look row whose calling script's self is
  the subject (the six action rows, SetMotionType, ApplyHavokImpulse, and two look-only rows, Sound.Play, whose subject is its first
  argument, NativeSubject::Arg0Method, and CreateDetectionEvent, on the trigger itself) as kind "look", and still runs it here; line
  "[verb:traps] <Class.Name> on <id>: its firing seat's look, queued (D-W2) (<n> so far)"; a look-only row outside a look is counted
  " (local)" and never queued. Not reported: Activate (D-W1's root), SetDestroyed (DestructionStage), PlaceAtMe (W3) and any call on
  another reference. Switch setTriggerLook(bool), off in the platform, on by the client setting triggerLook (default true), acting
  only with the presser rule on; the fallback lever setTriggerPresserExempt(classes), empty, a list used only on a red (the design
  law's debt).
- Server (S5, built: fork m4-fifty-server ec72568f and e232e437, the T2 session trigger-look bcdf5e09): natives_table.rs's look
  column (Look::Also on the six action rows, Look::Only on SetMotionType, ApplyHavokImpulse, Sound.Play and CreateDetectionEvent,
  forty-three rows); the owner is S1's firing_source over the call's own facts (look_owner: the host at the epoch, or a loader one
  of whose actors stands within firing_reach); from the host at the epoch a Look::Also row takes its own channel, an ordinary action
  with its "animates" line; a look is relayed to the subject's other listeners, CreateDetectionEvent to the cell's host alone with a
  0x14 argument named as the reporter's actor, and kept nowhere; the look cap 12 at once then 2 a second per subject (UNMEASURED; 8
  until e232e437, raised so SoundTrap's ten looks a pass fit); refusals E_SCRIPTCALL_OWNER, E_SCRIPTCALL_FAR (new),
  E_SCRIPTCALL_LOOK_RATE (new), E_SCRIPTCALL_ROW. R2: that the reporter's press fired the trigger is its word, as the root is.
  docs/WIRE.md's ScriptCall section has the contract.
- Client (C4, built: fork m4-fifty-client eb226e5c, 2d8743de, 7a870e66 and 468b1029): ScriptCallService sends kind "look" as an
  action ("trigger look <id> <Class.Name> reported (D-W2)"), the seat's own player kept as 0x14 in its arguments (7a870e66: the
  server names it the reporter's actor); the watcher plays the relay under the platform's mark, PlayAnimation through
  ObjectAnimationService.play (never kept for a family reference), the graph variables through setVariable, and the motion rows and
  Sound.Play by runMethod, counted " (platform)", never re-reported and never a prop claim ("trigger look <id> <Class.Name> played
  here (seq <n>|no seq) (D-W2)"); the cell's host runs a relayed CreateDetectionEvent on its copy of the trigger with akOwner its
  copy of the figure ("trigger look <id> ObjectReference.CreateDetectionEvent played here (owner <o>, level <l>) (D-W2)", the level
  bounded 0 to 100); a seq-carrying SetMotionType, ApplyHavokImpulse or CreateDetectionEvent whose subject is no trap family trigger
  here is dropped ("trigger look <id> <Class.Name> dropped: no trap trigger here (seq <n>) (D-W2)", 468b1029).
- R2, unvalidated (rule 5; the D-W2 code review's note 3, 468b1029), the look relay's animation rows: the server reads no script
  archive, so it cannot tell a trap trigger from any other world object, and a receiving seat plays the six action rows whatever
  their subject, since the same rows are a host's ordinary actions: a modified seat within reach can play a trigger's graph events
  (and those of any world object it stands by) on the other seats. Bounded by firing_source (a game with the subject's cell loaded,
  one of whose actors stands within the subject's activation reach plus 512, else E_SCRIPTCALL_FAR or E_SCRIPTCALL_OWNER), the
  per-trigger look cap (12 at once then 2 a second per subject, E_SCRIPTCALL_LOOK_RATE, beside the reporter's 32 then 8), and the
  client's drop of a motion, impulse or detection row on a non-trigger (the Client bullet above; a detection's level outside 0 to
  100 skipped). The server keeps nothing of a look, so a forged one reaches no late joiner and survives no restart; a receiving seat
  keeps a relayed play on a world object outside the trap family for its own 3D loads (ObjectAnimationService's keepsFor), its
  session alone.
- The hypotheses: H-LK1, the relayed SetMotionType(self, 1, true) drops the watcher's rope as its own script's did in 49
  (HYPOTHESIS; the measure exists: x-trap-wire-rope v1's green 20261107-032511 read the break point turned 91.6 and 122.1 degrees
  on two seats whose own scripts dropped it, a taut rope 0.0, so x-trigger-owner v2, x-trap-wire-rope v2 and x-trap-wire-lure v1
  claim more than 20); H-LK2, a trigger's look calls fall inside LOOK_MS of the owned event that started them, the plate's 'Up'
  after its owner's leave (HYPOTHESIS; x-trigger-owner v2's Up claims); H-LK3, a relayed Sound.Play(source) plays the trigger's
  sound at the watcher's copy (HYPOTHESIS; the watcher's "played here", Eli's ear at T4); H-LK4, the watcher's bones rattle from the
  relayed SetMotionType and ApplyHavokImpulse (HYPOTHESIS; x-trap-bone-alarm v1's plays, its screenshots; the bones' node names
  are owed before a node claim).
- Carried since the platform's P3 (244c9162, the coordinator's addition) and 7a870e66: CreateDetectionEvent, to the cell's host
  alone, so that a guest's bone alarm wakes the NPCs the host simulates, as D-S3's host copy did for the guest's figure (HYPOTHESIS:
  no run has read the wake; 49 verified the chimes, not the wake; x-trap-bone-alarm v1.1 records its seats' CreateDetectionEvent
  lines and claims none). Not carried, declared: SoundTrap's PlaceAtMe, a look later than LOOK_MS, a late joiner's look (a
  one-shot).

The proof, Eli's condition: playtest 49's VERIFIED IN PLAY trap items claimed on both seats in the build's own stage before any
playtest of D-W2, and a red keeps D-S3's per-seat firing for that case (setTriggerPresserExempt) rather than shipping the
regression. The regression list for that stage (probes in lab/.cache/drafts/fifty unless named, each by path):

| 49's item (traps.md, "Playtest 49") | claimed today by | for the stage |
| --- | --- | --- |
| the bone alarm from the seat that did not walk into it | nothing: no scenario or probe ever claimed it | x-trap-bone-alarm v1 (new): each walker's own alarm fired, its four looks reported, the watcher's copy fired nothing and played all four, both ways |
| the tripwire snapping on both screens for the host's own trip | x-trap-wire-rope v1 (lab/.cache/probes, green 20261107-032511), whose guest claim reads the guest's own script, false by design under D-W1; b-trap-record-restart (committed) claims the wire's record alone | x-trap-wire-rope v2 (a claim rewrite, Eli first): the host's look reported, the guest's play of it, both ropes' break points past 20 degrees; b-trap-record-restart rerun unchanged |
| the tripwire snapping on both screens for a lured NPC | nothing | x-trap-wire-lure v1 (new): the bandit 0xb6ff7 moved onto the wire on its simulator; the host fires it once as the NPC's owner, the guest plays the root and the rope look, both ropes past 20 degrees, the rocks the host's |
| the tripwire on both screens for the guest's own trip (the D-W2 direction 49 never had) | nothing | x-trigger-owner v2, leg D |
| the wall killing draugr | x-trap-npc-kill v1.2's leg A (lab/.cache/probes, green 20261106-193605), whose premise counts D-S3's tail, gone from the train | x-trap-wall-kill v1 (new): that leg A alone in D-W1's words, the death on the wall's evidence, the record and the guest's copy dead |
| the blades killing draugr | x-trap-npc-kill-late v1.3 (lab/.cache/probes, green 20261107-073104) | rerun unchanged: the chain 0xfda45 is a mechanism, the host's; neither D-W1 nor D-W2 touches it |

Beside them in the stage: b-object-anim v6 and b-bleak-traps v4 (the gate set's plate legs, Eli first), b-trap-look v1 (the
look's gate scenario, from x-trap-bone-alarm v1, x-trap-wire-rope v2 and x-trigger-owner v2's looks), and x-trap-wire-follower
v1.1 (lab/.cache/probes) retired from the set: its claim that the watcher's own copy never ends "unfired" is false by design under
D-W1, whose watcher never fires its own wire.

## Status

- [ ] doc complete, inventory listed with a disposition per row, rung declared
- [ ] engine surface cited or delegated
- [ ] server logic + T0
- [ ] message + validator (same commit)
- [ ] native hook + T1
- [ ] TS handler
- [ ] T2 green
- [ ] T3 scenario green, no HYPOTHESIS tags
- [ ] parity scenario green, or its later list reviewed with it (ADR-031)
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [ ] ledger and suppression registry updated

Play: BROKEN, playtest 49 (2026-11-06, docs/verbs/traps.md "Playtest 49"): the guest's walk through the Temple's cobwebs tore
nothing on any screen, and the spike wall fired 11 times on c1 and 5 on c2, each seat firing for its own bodies and NPCs on the
plate.
