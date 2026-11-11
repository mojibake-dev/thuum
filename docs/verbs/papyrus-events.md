# Verb: papyrus-events

Drafted 2026-10-19 evening (train-29's first row) from playtest twenty-six's
missing Apocalypse MCM, the lab's Survival Mode reads of the same evening and
ADR-044 (accepted 19:32 PDT). Code on fork branch m2-train29-filter.

## Intent

A connected game runs the Papyrus scripts the mod layer admits (every
SkyUI-derived menu, and every script of a plugin the layer names, the
Survival Mode Creation first) the way single player runs them, while
vanilla's quests, aliases and references stay blanked as ADR-008 and ADR-029
require.

Roadmap reference: none
Milestone: M2 (train-29; ADR-044)   Class: A

## Inventory (ADR-031: the action's consequences, before its rung)

Not a player's action but a policy on which scripts a game runs; the
consequences are the admitted scripts' own. From the records (lab/esm.py on
ccQDRSSE001-SurvivalMode.esl; apocrypha's census docs/research/layer-papyrus.md,
the .pex headers) and the lab's reads (x-survival-why 20261020-020729,
x-survival-unblock 20261020-023907, x-survival-unblock3 20261020-024406):

| consequence | seen in | disposition |
| --- | --- | --- |
| Survival_MainScript's 5 s check (RegisterForSingleUpdate then OnUpdate): Survival_ModeCanBeEnabled (a0f) set, the "Enable Survival Mode?" box once (8df), the mode on (826) when the switch (828) is on | record, x-survival-unblock3 | runs in each game once its script is admitted (this verb); the switch and the prompt flag are the player's (R2, player-globals, 828 and 8df kept per player since main 43765ff) |
| Survival's needs (cold, hunger, fatigue: Survival_Need* scripts, TimedAbilityScript and MagicImod effects on the player) and their HUD | record | R3 in the player's own game (ADR-044 decision 4): shown and felt there; a need's damage or regen change reaches the server only where a verb carries it, none today |
| SkyUI's MCM list: a mod's config quest registers through OnInit and the SKICP_configManagerReady callback (SKI_ConfigBase.OnConfigManagerReady, RegisterMod) | docs/research/papyrus-event-filter.md 2 | runs in each game once SKI_ConfigBase's descendants pass (this verb); the settings a menu writes are R2 per player where player-globals lists them, client-local otherwise |
| Everything else a mod's quest or alias script does (Jewelry Limiter's checks, Reading List's tracking, IDRC's scenes: the census's 19 blocked mods) | census | stays blanked until the plugin is admitted by a row in lab/layer/papyrus-admitted.tsv with its rung said (ADR-044 decision 2) |
| A magic effect on another actor (a cloak on a target, mind control, thralls) | census, ADR-029 | stays blanked: ADR-029's server-side allowlist's ground, not this verb's |

### Sequences and combinations (ADR-033)

| sequence or combination | probe or scenario | result |
| --- | --- | --- |
| the admitted quest's chain from the game's first tick (a blanked first OnUpdate never re-arms) | b-papyrus-events (a0f within 20 s of the connect) | T4 CONFIRMED, playtest twenty-seven (the Creation's box within a minute on both seats, the first ever in a connected game; the lab's layer stage saw it on both clones at 06:41); the scenario runs after the template-save fixture lands (its 8df read becomes 1) |
| the same after a relaunch and a login with the record restoring 828 and 8df (no box, Survival on) | b-papyrus-events phase two and playtest twenty-seven's restart row | T4 ticked (the server restart and test 2's relaunch kept Survival on); the restore can lose the race to the 5 s check (test 2 at 18:23Z saw the box once more), so the lab's fixture is the template save carrying 8df = 1 and the per-player default the belt (docs/verbs/player-globals.md) |
| a client without the layer (no file): today's behavior | the stage's smoke without the layer | |
| the MCM list with the layer (eight menus, SkyUI plus seven) | x-mcm-register (hud-trace "MCM: Registered N new menu(s)."), layer stage | T4 CONFIRMED, playtest twenty-seven (the list showed the eight; an Apocalypse setting changed on test 1 survived the server restart and a relaunch, b-player-globals' row); the HUD count still to read |

## Authority

Rung: R3 for the admission itself (which scripts a game runs is that game's);
the state an admitted script touches keeps the rung it already has (a global
R2 through player-globals; an actor value through the existing report paths;
another actor's state stays the server's).
Why this rung and not the one above it: the server has no Papyrus VM for
quests (ADR-029's context) and nothing to validate in a menu's or a needs
meter's events; TES3MP runs client scripts and sorts their state the same way.
What the server validates (R1) or records (R2): nothing new; 828 and 8df are
already recorded per player.
Rate limit / bounds: none on the wire (no message); the hook's extra cost is
one hash lookup per attached script per event, OnUpdate now included (the
first build counts the rate with a Frida tracer, ADR-044 decision 3).

## Engine surface

- CommonLibSSE-NG symbol(s): RE::BSScript::ObjectTypeInfo::GetName and
  GetParent (include/RE/O/ObjectTypeInfo.h:126-128; parentTypeInfo :178);
  RE::BSScript::Internal::VirtualMachine::attachedScripts under
  attachedScriptsLock (include/RE/V/VirtualMachine.h:219-220); the hooked
  function is VirtualMachine::SendEvent (IVirtualMachine's virtual,
  include/RE/I/IVirtualMachine.h:89).
- Address Library ID(s): SendEvent RELOCATION_ID(98077, 104800), the fork's
  skyrim-platform game/Offsets.h:18-19, the hook upstream installed in 2021.
- If UNKNOWN: nothing unknown; no new address.

## Observe (host or acting client sees the intent before the engine acts)

- Hook point: the existing Frida interceptor on SendEvent (FridaHooks.cpp
  OnSendEventEnter); unchanged entry, changed admission.
- SP filter (minSelfId / maxSelfId / eventPattern): none new; the JS hook
  (sendPapyrusEvent) sees every event before the blank as before.
- Data captured: none.
- Side effects of hooking here: CONFIRMED (the hook is the one every verb
  since M1 runs under).

## Impose (observers render the server's decision)

- Mechanism (SP API call, native call, snippet): none; nothing is imposed.
- Visual without simulation achieved by: not applicable.
- Side effects: none.

## Suppress (engine's own behavior blocked on non-hosts)

- What is suppressed: as before, every Papyrus event to a script that is not
  admitted, in every connected game (skymp5-client's blockPapyrusEvents(true)
  at its first tick); OnUpdate now goes through the same admission instead
  of being blanked for all.
- How (blockPapyrusEvents, setInventory guard, AI toggle, hook early-return):
  the SendEvent hook replaces the event name with "" (FridaHooks.cpp,
  OnSendEventEnter's last lines). Admission: (1) the script or any class it
  extends is named SKI_* (the chain walk AdmittedByChain, depth 16); (2) the
  script's class name is on an admitted plugin's line of
  Data/Platform/papyrus-scripts.txt, read once at Skyrim Platform's load
  (LoadAdmittedScripts, from Frida::InstallHooks), names compared without
  case; (3) the named leaf entries as before (RaceMenu*,
  GRIM_ALT_TeleportationMarker, WB_DestroyAfterDelay_Script,
  defaultDisableHavokOnLoad); (4) an ActiveEffect event with the player as
  target or caster (ADR-031). The file is the layer's
  (apocrypha/layer-essentials: papyrus-admitted/Platform/papyrus-scripts.txt,
  installed hash-checked by add-mods; rows in lab/layer/papyrus-admitted.tsv;
  generator lab/tools/papyrus-map.py). No file: an empty list, today's
  behavior.
- Release condition (host handoff, cell unload): none; the block is the
  connected game's for its whole run.
- Side effects: HYPOTHESIS until the branch's stage: (a) the eight MCMs
  register (x-mcm-register with the layer); (b) Survival's check runs under
  the block with the list (b-papyrus-events: a0f within 20 s); (c) the hook's
  cost with OnUpdate consulting the list stays unmeasurable in play (a Frida
  counter on 104800 in the first run); (d) no vanilla script wakes (the list
  names only the Creation's own classes; MagicImodBasicScript and
  MagicImodOnPlayerHitScript are vanilla classes the Creation's effects use,
  so any vanilla effect on the player using them already passed by ADR-031's
  exemption, and one on another actor now passes by name: to watch).

## Message contract

- Message name / numeric type: none; no wire change (rule 4 not engaged).
- Direction: not applicable.
- Fields: not applicable.
- Validator rules: not applicable.
- Idempotency / ordering: not applicable.
- Contract doc updated: not needed.

## Server

- Where the logic lives: nowhere; the list rides the mod layer with the load
  order, not server-settings.
- DB fields / migration: none.
- Restart behavior: nothing of this verb's is the server's.
- Papyrus natives touched (ledger lines added): none.

## Client

- SP binding: Skyrim Platform FridaHooks.cpp: LoadAdmittedScripts,
  AdmittedByChain, the OnUpdate guard removed (fork m2-train29-filter).
- TS handler: none.
- Kill switch config key: delete or empty Data/Platform/papyrus-scripts.txt
  (the plugin half); the chain walk has none and is the verb.

## Tests

- T0: none (no server half).
- T1: the Windows build (the first push-built GitLab client, ADR-040's
  sky-build) compiles the hook; no host-less test reaches the VM.
- T2: none (no wire change).
- T3 scenario id: lab/scenarios/b-papyrus-events.yaml (c1 connected under
  the block with the Creation admitted: Survival_ModeCanBeEnabled reads 1
  within 20 s of the connect, which it never did on parity, x-survival-why
  20261020-020729 and x-survival-unblock 20261020-023907 at 0 for 25 s; the
  switch and the prompt flag untouched by the check). The MCM half needs the
  layer: x-mcm-register on the layer stage, hud-trace's "MCM: Registered N
  new menu(s)." with N the eight.
- Assertions that would fail if the verb silently regressed: a0f at 0 after
  the connect (the chain blanked at its first OnUpdate again); the MCM line's
  N at 1.

## Dynamic plan (fill when any tag above is still HYPOTHESIS)

- Frida script: lab/frida/hud-trace.js for the MCM line; a counter in
  push-trace.js's shape on 104800 for the hook's event rate (one run, the
  number into the Suppress section).
- Breakpoint plan for a human session: none needed.
- Owner: agent (lab probes).

## ADR-062, slice 1: the hosted cell's scripts run (17:12 PST 2026-11-02; slice 1a BUILT on fork m4-scripts-work f08abd57, the gate and the lift; the hooks of decision 2 follow the re-analyst's table)

Eli (playtest 41): "shouldn't 'scripts work' be a holistic fix? something structural is just not working"; at the sign-off:
"shouldn't every script incident be transmitted and accepted? skyrim is not a competative game. trust should LARGELY be the
default". ADR-059's name list (the layer's host rows) failed every dungeon; ADR-062 flips the default and moves the safety to the
natives that change server-owned state, each a record-and-relay row (R2, declared unvalidated by rule 5).

The gate's new rule (Skyrim Platform FridaHooks.cpp OnSendEventEnter, replacing AdmittedByChain's host-scoped walk):
- the event's self is read for its cell in every case the VM hands a reference OR an actor (today the actor branch sets selfId
  alone and selfCell stays 0, so an actor's script, the spider's masterAmbushScript, never saw the hosted-cell rule);
- in a cell this game hosts (g_hostedCells, hostService's SetCellHosted at every grant and release): a WORLD OBJECT's event
  passes whatever its script's name (ACTI, DOOR, CONT, FURN, MSTT, STAT, FLOR, TREE, LIGH, any non-actor reference); an ACTOR's
  event passes when this game simulates the actor (Hosted::Is and not Puppets::Is: the host's live NPCs; never a player's figure,
  whose scripts stay ADR-044's player rows); a puppet's stays blanked;
- outside a hosted cell nothing changes: ADR-044's plugin rows (the player's own effects), the per-name exceptions (RaceMenu, Lost
  Grimoire's marker, Apocalypse's placed visuals, defaultDisableHavokOnLoad), the lifecycle events of decision 1 and the
  never-admitted list stand as they are;
- the layer's host-scoped rows (papyrus-admitted.tsv's fifth column, g_hostAdmittedScripts) retire: papyrus-map.py stops writing the
  marker, the loader ignores one it finds, the six MS13 names of 2026-11-02 go with them.

The client's lift (objectReferenceEx.ts dealWithRef): a scripted world object in a cell this game hosts keeps the engine's own
activation (blockActivation false) whatever its base; the setting activationUnblockedBases retires with its list. The lift
follows the hosting: hostService's grant and release pass over the cell's loaded references (the view's bound ones and the
engine's own, the cell's reference list) and set the block again at release, so a guest's seat blocks as before and a new host's
seat lifts at its grant. ADR-059 decision 2's relay stays the guest's way in (RelayedActivation toward the host, the host's
engine activating as the guest's figure) and decision 3's ObjectAnimation relay the guest's eyes.

The hooks of slice 1 (the natives whose verbs exist; the entries from docs/research/adr062/papyrus-native-entries.md, the
re-analyst's read, rule 1): Quest.SetStage (the quest-stage sink already hooked: QuestStageSinkReplacement reports the host's
stage), ObjectReference.AddItem and RemoveItem (the host's report into the inventory record of an NPC or a container the host
simulates; the player's own is the existing inventory report), Activate (the linked-activation report exists), PlayAnimation and
PlayAnimationAndWait (the sendAnimationEvent hook carries them), Lock and SetLockLevel (the locks verb's report), SetOpen (isOpen),
Actor.Kill (a new death-report evidence kind, "a host-run script killed it", recorded), Spell.Cast (the cast hooks), the weather's
ForceActive (the weather report). Each hook filters in native before the bridge (rule 9: the self reference's cell hosted here,
the caller a script frame, not the engine's own call) and gets its docs/NATIVES.md line with its rung (rule 10).

Built in slice 1a (f08abd57): FridaHooks.cpp OnSendEventEnter reads the self's cell for actors as for references, passes a world
object's event in a hosted cell (its lifecycle events anywhere) and a simulated actor's (Hosted and not a puppet) wherever it
stands, consults the layer's host names no more (the host rows and their lifecycle rule are deleted on m4-scripts-flip, 2026-11-04:
an older layer's "<plugin> host:" row is skipped and counted at the load, "N host-scoped row(s) skipped (ADR-062 decision 1)");
objectReferenceEx
lifts the engine's activation on activators and movable statics in a hosted cell (doors, containers, furniture and items keep the
server's flows), HostService walks the cell's references by kind (Cell.getNumRefs, getNthRef) at every grant and release, and
ActivationService sends no Activate for the player's own press on a lifted object. The lab's lever activationUnblockedBases is
DELETED on m4-scripts-flip (1fdc321b, 2026-11-04): the lift decides, no list of bases; the three scenarios' relaunch writes go with
the stage's lab lane. One base the lever named is a FURN the lift does not cover, the puzzle lever 0xb7db4 (LeverPushAnimatingNoPlayer),
blocked on every seat now; its script's OnActivate on a blocked reference is HYPOTHESIS until b-bleak-traps leg E and b-puzzle-relay
leg C read it on the flip's stage. HYPOTHESIS H1a: Cell.getNumRefs and getNthRef enumerate an exterior
cell's activators on a loaded cell (Papyrus's own, UESP "Cell Script"); H1b: a blocked activator's own press reaches its script
(playtest 41's pillars say yes) and a lifted one's default processing fires its activation parents once per press (the spike wall).

Built in slice 1b (fork m4-scripts-work, 19:34 PST 2026-11-02; the first head ddfbd605 went through numidium's fresh rules review, FIX
FIRST, and this is the round after it): the platform's ScriptNatives (24 natives of the table hooked at their own entries,
resolved by class and name from the VM's bindings at kDataLoaded, the hook's callbacks registered at plugin load so the attach
never inserts into the map the live hooks read; each attach counted by Gum's answer), the event scriptNative (native, self, arg,
value, cell, actor, stackId, count), ScriptNativeService (the census per 30 s, the first five live calls per native logged, the
script-kill marks consumed by DeathReportService's cause 3) and the server taking cause 3 as the host's word (R2 in npc-fate.md,
MayDie and the body distance lifted for it). The review's blocking finding and its answer: the platform's own calls (callNative's
direct path on the worker, the latent path through VmCall::Run, every SpSnippet, so the client applying the server's word through
setOpen, lock, activate, kill, setCurrentStageID and setValue) reach the same entries, so a thread-local mark (PlatformCall.h)
wraps them and the hook counts them apart as "<native> (platform)". Rule 9: a quest's, a global's or an alias's call (every seat
runs those scripts) and every call filtered as not hosted here are tallied in native and flushed as one census event per row
every 30 s; a kill row is never dropped by the 64/s budget. The convention HYPOTHESIS (self at argument 2) is guarded: the first
three calls of each row probe the self under SEH and a row whose self is no form of its kind stands down with one warn line, so a
wrong row is a log line, not a crash; the trace still confirms it. Kept as they are, with the reason: guests run the lifecycle
handlers of every world object (slice 1a's decision; the engine fires OnInit, OnLoad and OnCellAttach before a host is known, and
the tally " (not hosted)" is the census of what those handlers then attempt through the hooked natives, read on a guest first).
Round two (19:55 PST 2026-11-02; numidium's re-review of the first round: OK to stage on one seat, not to merge; the latent path was
not covered, since DispatchMethodCall2 only enqueues the call and the VM runs the body later on its own thread under a new stack
id, so the thread-local mark and the stack-id net see nothing of it; the first H-1b1 was false by construction). The latent calls
are now noted by (row, self) in CallNative before VmCall::Run (PlatformCall::NoteLatent, the lower-cased "Class.Function" key and
the self's TESForm pointer) and taken by the hook at the entry (TakeLatent), so the client's setCurrentStageID, enable, disable,
resurrect and delete count as "(platform)" like the direct calls; the census flushes on time from the platform's OnUpdate
(ScriptNatives::Tick) so a quiet seat emits its last window; the self probe accepts every placed kind through TESForm::AsReference
(a placed hazard among a row's first calls no longer stands the row down); the form argument's read is guarded the same way.
Round three (20:18 PST 2026-11-02; the re-review of round two: fix two, then one seat): a latent note carries a token and is forgotten
when the dispatch is refused or when the call's stack returns (onResult), an aged note is dropped at the next look (the 15 s
backstop), only the 24 rows' keys with a non-null self are noted, and the key is the resolved function's own class and name (a call
through a subclass resolves to the parent's row); the self probe is a plain read of the form type again (a virtual call through a
wrong but readable pointer would run another class's slot under the mutex, which SEH cannot catch), accepting every placed kind,
REFR through PlacedHazard and an Explosion; the essential case's cause-4 report carries a noted hit so only MayDie refuses it.
The (row, self) notes and their known limit (a note carried no call id, so a script's call on the same self inside the 15 s window
took the platform's note) are RETIRED on m4-scripts-flip (the native lane 1761585e, 2026-11-04; fresh review GO): one Gum hook on
BSScript::NativeFunctionBase::Call (CommonLibSSE-NG NativeFunctionBase.h:47, slot 0x0F; Offsets.h:130 RELOCATION_ID(97923, 104651),
RVA 0x143dc00 by just addr) early-outs unless `this` is one of the 24 bound IFunction pointers, reads the Stack's callback (Stack.h:83,
+0x90) and stackID (:80, +0x80), and if the callback is a live VmCallback (a set VmCall::Run notes BEFORE DispatchMethodCall2 and
forgets on a refused dispatch; VmCallback's operator() forgets before onResult, its destructor as the backstop) raises PlatformCall's
depth for the call's extent, so the entry hooks see Active() on the VM's own thread exactly as the direct path does. Ready lines:
"native dispatch hook on NativeFunctionBase::Call at +143dc00 (Address Library 104651)", a raise line per platform-dispatched latent
call ("dispatched by the platform on stack N", the first three then every thousandth). Cost: every native call in the game pays Gum's
bracket and the handler's lookup before the pointer compare, the house idiom of the 24 entries (the review's estimate 0.2 to 0.5 us a
call, a Papyrus-budget tax, not frame time); a dedicated raw listener is the fix if a stage reads a Papyrus slowdown. HYPOTHESIS
H-L1: the Stack the VM hands Call for a platform-dispatched latent call holds our IStackCallbackFunctor unwrapped at +0x90 (falsified
by a platform call tallied live with no raise line); H-L2: the native's body runs within Call's extent on the same thread (statically
yes, NativeFunction.h:81; falsified by an entry hit whose thread differs from its Call hit); H-L3: Stack's +0x80 and +0x90 hold on
1.6.1170 (falsified by a raise line's stack id disagreeing with the entry's, or a garbage callback pointer). A throw through a hooked
Call would leave a stale level on its thread; the review's guard (the entry stack pointer per level, stale levels popped at the next
enter) is applied before the stage. The settling trace: Frida on 104651 (this, +0x80, +0x90, the thread) beside the 24 entries and
DispatchMethodCall2 on a guest applying a relayed stage, x-script-natives v7's frame. HYPOTHESIS rows: H-1b1 (rewritten) the latent note's self is the pointer the native receives (CallNative's rawSelf is the
TESForm the VM hands the native; a mismatch shows as a latent row counted live on a guest at a relayed apply, where only the
platform could have called it); H-1b2 every SpSnippet runs through callNative, so one of the two marks covers it; H-1b3 the self
probe tells a wrong row (a register holding another form of the right kind passes it). The guests' lifecycle handlers (finding 9)
are Eli's decision: docs/private/decisions-after-slice-1b.md (D-S1, recommended A with the bound written into ADR-063 and a guest
read owed; numidium carries it). Known limits: the entry hook sees the call, not its effect (a refused Kill still leaves a 10 s
mark; the census counts attempts); AddItem, RemoveItem, Lock, SetOpen and the weather are census-only in this slice; a MovableStatic
is blocked like the other scripted kinds when not hosted (objectReferenceEx), so every seat agrees with the host's release.

Tests: T0 for each verb's new report path where one is new (the scripted kill's evidence in ActorDeathTest; an NPC's scripted
AddItem recorded in PartOne_ActivateTest's shape); T1 none; T2 difftest's sessions unchanged (the reports are the same messages);
T3 the baseline first (b-object-anim on the union's dist against the morning's ad1aa50a green, the spike wall's regression), then
the Bleak Falls walk by hand on slice 1's stage (the plate and the wall, the pillars and the lever, the spider's drop, Arvel's web
and run, the alcove draugr waking), then q-golden-claw and q-embershard as slice 3's scenarios. Status boxes below stay as they
are until the slice is built; the build opens its fork branch as m4-scripts-work off parity.

The first lab read (one seat, m4-scripts-work 425a9cd6's stage of 20:49Z 2026-11-03, probe x-script-natives v1 as run
20261103-045048, numidium's read of c1.log after the probe went red on its own grammar at the hook block): "24 of 24 native entries
hooked (ADR-062 slice 1b)" at 20:52:31.812Z and no row stood down at its self probe; every one of the 24 runtime offsets equals the
research table's RVA (docs/research/adr062/papyrus-native-entries.md: 16 by row name, 8 in the combined rows: Enable 0xa2cc50,
EnableNoWait 0xa2cd10, Disable 0xa2ca70, DisableNoWait 0xa2caa0, Kill 0x9e90c0, KillSilent 0x9e9090, PlaceActorAtMe 0xa2e6d0,
SetCurrentStageID 0xa46fd0), so the table's entry addresses are CONFIRMED by a run id while every behaviour row (the calling
convention, the self probe's meaning, the latent note's self) stays HYPOTHESIS; the first census flush "1743 tallied native call(s)
in 30 s over 22 row(s) flushed to the census" at 20:53:10.967Z; zero live "native GlobalVariable.SetValue on" lines, which is no
evidence for H-1b2 after all: a global's or a quest's call is tallied and never raised per call (ScriptNatives.cpp's Form and Alias
kinds), so that zero cannot fail; the census rows carry the evidence (a "(platform)" row present, no unmarked row for the same
self). Unread: the per-row census and the
"(platform)" and "(not hosted)" keys (ScriptNativeService's summary follows the platform's flush by up to 30 s and the run had
stopped 39 s before the flush). x-script-natives v2 (by path) gives every seat claim its own log-count step, waits two flushes, claims
the platform's flush and the service's summary apart, and adds the guest leg (a second seat in the host's cell: "(not hosted)"
tallies and no live row for cell 9732); the relayed quest stage read for H-1b1 is its v3.

The second lab read (two seats, probe x-script-natives v3 as run 20261103-062800 on 425a9cd6's stage, numidium's read): every
claim held but one. Both seats' 24 hooks attached and none stood down; the platform's flush ran 7 times on c1 and the service's
summary 6 in the census window; "GlobalVariable.SetValue (platform)" 3 with no live SetValue line; the host's console stage set
relayed ("set 10d3bb:Skyrim.esm stage 10: recorded, relayed to 1"), the stage done on both seats, and c2.log carried the fragment's
skip ("fragment of 10d3bb stage 10 entry 0 skipped: the stage is the world's, applied from the relay; 0 mark(s) left for the
pair") and the latent apply's onResult: H-1b1's positive evidence (the guest's zero live "native Quest.SetCurrentStageID on" lines
is none: a quest's call never raises a per-call event, so a leak would show as an unmarked census row "Quest.SetCurrentStageID on
10d3bb", which the probe claims absent since v5). The one red was the lab's: the console log cuts a line near 100 characters and the guest's
"Quest.SetCurrentStageID (platform)" row sat past the cut of the summary line. m4-scripts-work d26d057e writes the census one row
per line ("census <Class.Name> N in 30 s") and names the self of a quest's, global's or alias's call in its row ("Quest.Start on
<id> N"), so the census says which script calls; the probe v4 reads the rows. Two numbers the census showed on BOTH seats, kept as
hypotheses: H-1b4, "ObjectReference.SetOpen (platform)" about 1450 per 30 s, about 48 a second, the client's own apply of the open
state at frame rate through a Papyrus native (modelApplyUtils.ts applyModelIsOpen, called by formView's update for every reference
with an isOpen model about every 133 ms; whether the engine's SetOpen is idempotent or re-sends the state each tick is the read, and
a HYPOTHESIS for Eli's inventory flicker: an open state re-applied under an open menu); a fix applies the state on change alone,
behind ADR-064's containers freeze until its doc exists. H-1b5, "Quest.Start" about 40 per 30 s unmarked on the host AND the guest:
a script calls Quest.Start about 1.3 times a second on every seat, D-S1's data point (a quest has no cell, so the hosted filter
cannot stand it down); the run's driver logs name it already ("questStart quest 30002859 (and 13 more in the last 10 s)" on both
seats), a quest of load-order index 0x30, finding 77's shape (Reading List's RL_DetectionQuest starting every half second,
LOG.md's 10-29 entry); the self-naming census row ("Quest.Start on 30002859 N", the platform's commit after d26d057e, at most
eight selves a row a window, 32 since c9a92e25) confirms it from the native's side, and whether any such start reaches the server as a report is the
next read (the census counts attempts, not effects).

The third lab read (two seats, probe x-script-natives v6 as run 20261103-073235 on dc8fb541's stage, numidium's read): 9 of 10
claims held (both seats read stage 10 of 0x10d3bb done; c2's "Quest.SetCurrentStageID (platform)" 2 lines and no "on 10d3bb" row;
SetOpen (platform) on both seats; Quest.Start on a real self on both; no server refusal but E_QUEST_OWN_START). The one red was the
census's cap, not a leak: c2's "Quest.SetCurrentStageID on others" 1 line (2 calls) in the guest's first window after its load,
eight named selves (2002b6e, 25185, 25231, 25251, 2830f690, 4b2d9, 703ecf2, c18e1) filling the row three minutes before the relay,
so 10d3bb at load could be ruled neither in nor out; the claim did its job. At the relay c2.log holds "fragment of 10d3bb stage 10
entry 0 skipped: the stage is the world's, applied from the relay; 0 mark(s) left for the pair" and then the platform's apply, and
no guest row for 10d3bb in any window after it: H-1b1's positive evidence again. The fix: m4-scripts-work c9a92e25 names up to 32
selves a row a window (a rare row names every self, since selves never exceed calls; a hot row's tail stays under "on others"), and
probe v7 keeps the "on others" == 0 claim beside the named row's absence, so the bound biting reads as a red and never as a pass,
and lists c1-console.log in its artifacts for the host's numbers. D-S1's measurement from the same run (ADR-063 decision 3's
amendment: the exception's size on a guest before slice 2; c2 as guest in c1's 0x9732 for about five minutes, ten census windows),
counting slice 1b's 24 hooks alone, so the open set is at least this: filtered "(not hosted)" 83 calls over 8 natives, all within
about 90 s of the arrival (RemoveItem 48, MoveTo 16, PlaceAtMe 8, DisableNoWait 5, Disable 2, EnableNoWait 2, Lock 1, SetLockLevel
1); live on the guest, the global natives the cell gate cannot filter: Quest.Start 401 and Quest.Stop 403 on 0x30002859 (about 1.3 a
second, every window; Stop's rest 9 one-offs and "others" 109 in one window), GlobalVariable.SetValue 62 named (fe000a0f 49 over 9
windows, fe01481e to fe01482e one-offs) and "others" 56 in one window beside the platform's 25 (timeService), ReferenceAlias.ForceRefTo
57 (2e00ce06 56 in one window, 2002b6e 1), SetCurrentStageID 11 at load; the platform's own: SetOpen 12037 in ten windows (about 40 a
second, H-1b4's family), PlaceAtMe 2, Enable 2, Activate 2, Resurrect 2, Lock 4, Disable 1, Delete 1. The host's census numbers are
the claims' line counts alone (c1-console.log was not in v6's artifacts; v7 lists it).

The fourth lab read (two seats, probe x-script-natives v7 as run 20261103-081915 on c9a92e25's stage, numidium's read): GREEN,
every claim held, the guest's "Quest.SetCurrentStageID on others" == 0 included, so the named row's absence now rules the stage set
at load out on the guest (H-1b1's positive evidence stands with the cap no longer in the way). The host's census from the run's
c1-console.log (ten windows, 111 rows; my count): "ObjectReference.SetOpen (platform)" 13368 (about 45 a second, H-1b4's family on
the host too); "Quest.Stop on 30002859" 401 and "Quest.Start on 30002859" 399 (H-1b5, every window), "Quest.Stop on others" 83 in
one window; "ReferenceAlias.ForceRefTo on 2e00ce06" 56 in one window; "GlobalVariable.SetValue on fe000a0f" 48 over nine windows,
"(platform)" 29 over six, "on others" 21 in one, and a tail of one-offs (2201d280 to 2201d283 at 4 each, fe01481e to fe014833 at
2 each, 201a31b 2); filtered on the HOST as well, "ObjectReference.RemoveItem (not hosted)" 47 over three windows, "MoveTo (not
hosted)" 16, "PlaceAtMe (not hosted)" 2, "Disable (not hosted)" 2, so the cell gate filters other cells' lifecycle handlers on a host
too, not only on a guest (the host of 0x9732 runs handlers for cells it does not host at its arrival, the same shape as the guest's
83); the host's own live calls were few: PlaceAtMe 6, DisableNoWait 4, AddItem 3, RemoveItem 2, Activate 2, and "Quest.SetCurrentStageID
on 2012f92" 2 beside the platform's 2 (the console setstage's own path on the host, as the probe expects). The open set's size on a
host is at least these filtered 67 in the first windows; D-S1's measurement holds on both viewpoints.

## ADR-068, rung 1: the flip on canon (2026-11-05, thuum-cf)

Fork m4-scripts-1-flip: the merge 772c00d3 of m4-scripts-flip 8896ef0c onto canon 7c79fc3e (wire-schema lib.rs keeps SCHEMA 35;
changeFormService.ts was a union, then canon's whole after the reverts below; ChangeForm.cpp's premise and its revert net zero),
pipeline 5386 green (T0 100% of 13, 589 cases; wire-test, wire-fuzz). Its fresh review (FIX FIRST) and what each finding became:
1. The merge carried three non-scripting heads canon kept out (d9836510 the container hold's client notes, 8f3c76fe the watcher's
   resurrect hold, fb547765 the record's ragdoll-settle wait), none proven alone against the canon: reverted in 8a5de0bc; the six
   client files they touched equal canon's byte for byte. They return as their own proven heads in the corpse lane.
2. A corpse laid from its record re-ran its own OnDying and OnDeath on the owner's seat (canon's apply completes the death with
   Actor::KillImmediate; the flip's gate passes a simulated actor's events): 1fdd7208 raises a thread-local RecordDeathScope
   around the apply's two KillImmediate calls (ChangeForm::CompletingRecordDeath) and the gate blanks OnDying and OnDeath under it,
   with the line "[verb:scripts] OnDeath to <id> blanked: a death completed from the record, not a world death". Narrower than the
   review's PlatformCall::Scope on purpose: PlatformCall is also raised for the platform's own latent calls, so a death applied from
   the server's word on a live actor (the world's first) would have lost its scripts. HYPOTHESIS: KillImmediate raises the death
   events synchronously on its thread; x-corpse-record v6's leg R reads the line.
3. KNOWN LIMIT, PLAUSIBLE: a script's kill of an ESSENTIAL NPC (cause 3 bypasses the essential check; the host's KillEssential
   clears the flag on the host alone) leaves the watchers' copies standing, the watcher's actor.kill refusing an essential actor
   (deathService.ts), its dead check re-killing every 2 s. The fix (a watcher kills an essential copy as KillEssential does, or the
   record's apply carries the death) goes with rung 4's Kill row; the Delphine case is its two-seat read.
4. KNOWN LIMIT, PLAUSIBLE: a host-run script that dresses a hosted NPC meets the canon's dress rule (worn armor the record lacks is
   dropped, which refuses the hosted actor's whole equipment report, its hands included). ADR-068's seam observes the script's
   EquipItem call itself, so rung 4's EquipItem row carries the named item into the record; until then the server should drop only
   the unknown entry rather than the report (a rung 2 server item). The read: E_EQUIP_REFUSED for a hosted actor in a stage's log.
The stage (after Step 0): the three trap and puzzle scenarios without their lever writes (lab/.cache/drafts/*-flip.yaml, each its
own commit), x-bleak-scripts v1 (sha1 42ac4e80), and x-corpse-record v6 (sha1 8f22e960) for finding 2's line; T2 on sky-srv when
the lab is free; the Windows client build when the seats are idle (a client build beside live seats contends for the host).

## ADR-068, rung 2: the one seam (00:46 PST 2026-11-05, 08:46Z 11-05, thuum-cf)

Fork m4-scripts-2-seam 9745d401 (rung 1's head dd280139 merged in 3a39a7df; 9745d401 feeds the pillars' script side from the
seam, since its mark silences the animation hooks for an owned call's extent), pipeline 5433 green (Windows client 19122, T0 598
cases), its fresh review GO with notes; on its stage with x-puzzle-whale v1.1 and x-bleak-scripts v2.1.

The record path (fork 7ee68bd7, pushed after the stage; its fresh review GO with notes): a ScriptCall action on a game-file
placement the server never loads (the Hall of Stories door FX 0x5256c, an MSTT, played by HallofStoriesKeyholeScript.openDoor)
is judged by its record (its cell from the record's group or, for an exterior, its position's grid square through
WorldState::CellOf; the reporter's hosting of that cell at the epoch) and mirrored to every other game that reports the cell
loaded, with the held path's two lines byte for byte. Authority: R2. Not validated (rule 5, recorded here): the mirror's audience
is client-reported, the games whose CellLoaded reports name the cell, with no reach check (a game that reports a cell loaded gets
its mirrors; an unload report dropped by CellLoaded's budget leaves the entry until that game disconnects); the content is
cosmetic. Declared limits: (a) nothing is kept for an unheld placement, so a late joiner misses its lasting pose until rung 3's
record; (b) a placement a script moved (MoveTo, SetPosition, TranslateTo) is judged in its record's original cell; (c) an
exterior placement stored in one cell's group but positioned in a neighbour's square is judged by the square, while the
platform's owner test reads the engine's parent cell. Fixes in flight from the same review: the per-sender budget is spent
before any lookup (a malformed or unheld subject costs no game-file search), the failed-attach list holds each id once, and an
exterior placement's unit case.

## ADR-068, rung 3: the script record's first read (10:50 PST 2026-11-05 (18:50Z 11-05), thuum-cf)

Rung 3 (the script record: TESModPlatform.SerializeScriptState mirroring the engine's own per-object writer, ApplyScriptState,
SendScriptEvent; docs/research/scripts-one-system-2026-11-05.md section 6.5) rests on H-R1, the static read of the engine's save
(docs/research/adr065-papyrus-state-2026-11-03.md Q1 and Q3). Read first, on the lab, before any of it is built (CLAUDE.md rule 2):
x-script-save v1.1 (20261105-184120, numidium's run on the D-T4 lay bd0c8cf8 with lab-driver 73e0608d's allow-save, since
skymp5-client turns saving off at every load) traced one F5 quicksave on c1, the Temple's host, with two puzzle pillars turned
(lab/frida/script-save-trace.js v2). H-R1 CONFIRMED by trace, MECHANISM ONLY (recorded under ADR-064 amendment B):
- One SaveGame pass (104828, 2.4 s with the hooks): 64591 script objects written by Object::Save (104249), every one writing
  exactly its type chain's variable count (104317's answer inside it): 64591 matched, 0 mismatched, 0 not constructed.
- One Object::Save per attached script: the spike wall 0x54b15's two scripts wrote two objects under one handle
  (TrapSwingingWall over MovingTrap over TrapBase, 52 variables, state Idle; TrapHitBase, 29, state CannotHit).
- Positional: every watched object's variables were written in index order 0 to n-1 (each Variable::Save's address against
  the object's variables[] at +0x30); the pillars 0xaa8cb and 0xaa8cc as defaultPuzzlePillarScript, 5 variables each (raw types
  3, 3, 5, a class, 5), in their turned states position02 and position01; the plate 0x567f2 as PressurePlate over
  traptriggerbase, 23 variables, state inactive. The flags written: constructed, initialized, valid, no properties pending,
  no lock holder. (v2's summary counted 25081 positional objects with variables and did not split the rest: script-save-trace.js
  v2.1 counts non-positional and zero-variable objects apart for the next read.)
- Handles: all 64593 SaveHandle calls of the pass came from the object table's writer (105016, +0x145c57f), none inside an
  object's data, in kinds 0 (64436), 1 (143) and 2 (14); a plain form's handle is kind 0 with mid 0xFFFF and its form id low
  (48703 objects), the others kind 0 with another mid (15731).
- The save did not stall the seat's connection: no stale-host line for c1 around it; c1 kept the Temple at epoch 1.
What the encoder takes from it: per attached script {type name, state, flags, variables in positional order, their count the
chain's total}, an object variable as its handle, a plain form's handle (kind 0, mid 0xFFFF, the form id). Still HYPOTHESIS
for rung 3: H-R2 (a mid-latent object read through its lock's stack), H-R3 (a direct currentState write runs no state events),
H-R4 (the apply race-free under the closed gate), H-R5 (lifecycle handlers plus the record restart a world script).

The build (11:36 PST 2026-11-06 (19:36Z 11-06), thuum-cf): the plan is docs/research/rung3-script-record-2026-11-06.md, a read-only
agent's against fork 5186df39 (canon since the train m4-traps-47 merged). Its first read corrects decision 5's last sentence
(ADR-068 amendment A): defaultPuzzlePillarScript's OnCellLoad turns the graph only once, guarded by doOnce, and from its first
side, so a re-sent OnCellLoad cannot render a pillar from its record; the record carries its view (the last animation event and
the object's sequence) beside the script state. The plan also finds three pieces the design assumed absent at 5186df39 (OwnerAck,
a digest cadence, a restart step in difftest) and lastAnimation never saved (MpChangeForms.cpp's TODO), so the record's view
stands in for it across a restart. The build, inside-out on fork branch m4-scripts-3-record: F1 the wire rule (wire-rules
script_state.rs), F2 the record and its persistence, F3 ScriptState 76 and ScriptStateApply 77 end to end on the server
(SCHEMA_VERSION 38), F4 the three TESModPlatform natives (SerializeScriptState, ApplyScriptState, SendScriptEvent) with the
gate's pending blank, F5 the client's ScriptStateService, then the lab's script-state step and view and the probes
x-script-state-read v1, x-puzzle-handoff v3, x-puzzle-late-join v1 and the restart scenario b-script-state-restart. Hypotheses
H-R2 to H-R9 and H-L1 are the plan's section 5. D-L1 B rides the same native (SendScriptEvent) as an optional slice, built ahead of
Eli's answer and never merged before it.

The integrated rung and its review (13:23 PST 2026-11-06 (21:23Z 11-06), thuum-cf): fork m4-scripts-3-record 4f525bad merges the
three layer branches (wire and server 91142e67, 85e2b60f, 47cae74c; platform 5b57999e, d008e0ca; client e008ad5f, 74cc6d07,
3e668eed) and one test fix; fork-lint, cargo (557) and the client's tsc and webpack green, the server-only pipeline 5559 green
(T0). Its fresh review: NO-GO until three fixes land (the client's login reset on its own CreateActor wiped records the server
sent first; a guest's give-up lost the load events the gate blanked; the platform's busy answer could not name the stack H-R2
reads), with notes; the fixes are on their layer branches now and the rung is merged again before its stage. Authority (rule 5),
declared here: a record's values are the owner's engine's word, R2, recorded and never judged; the server validates their shape
only (the wire's kinds, caps, handles and the sender's ownership at the epoch), and a receiving seat checks each script's class,
variable count, kinds and state against its own VM before it writes anything. Declared limit, from the review's note 9: at a grant
the server serves the records of the references the new host's game subscribes to (its emitters), so in an exterior or a large
interior a recorded reference beyond that subscription is not served at the grant; the puzzle room and the probes' rooms are
inside it. A late joiner is served behind each reference's create word, so the limit is the new host's alone; the follow-up is an
index of recorded references by cell served at the grant, after the rung's proof.

Rung 3's stage (16:01 PST 2026-11-06 (00:01Z 11-07), thuum-cf's read of numidium's stage of fork m4-scripts-3-record 458a6930 over
the SFW layer 9be64991): nine green of nine. The probes: x-script-state-read v1.1 20261106-231640, x-puzzle-handoff v6.1 232042,
x-puzzle-late-join v1.1 232435; the restart scenario b-script-state-restart 232737 (committed on main 32985845); the regressions
b-puzzle-relay 233336, b-object-anim 233708, b-bleak-traps 234432, b-trap-record-restart 235245 and a-restart-persistence 235718.
The hypotheses they settle: H-R2 CONFIRMED (a pillar mid-turn reads quiescent false with a state-3 stack, x-script-state-read's
busyState 3); H-R3 CONFIRMED by trace (script-state-trace.js on the late joiner: "stateEvents": 0, no onBeginState or onEndState
dispatched on the four watched objects across the applies); H-R4 CONFIRMED by run (every apply in three runs "stacks 0", the locks
held 15 to 157 us); H-R5 CONFIRMED for the pillars (the inherited host's next press was the server's 'Trigger02', the turn from
the record's side, and after a server restart 'Trigger03'); H-R6 CONFIRMED for kind 0 (every one of the trace's 457,391
FindBoundObject handles was kind 0, every record's object variables resolved, 0 seat-local; kinds 1 and 2 never met in these
rooms, still unread); H-R7 CONFIRMED (the late joiner's gate blanked OnLoad and OnCellLoad four times, "to aa8c[bc] blanked: its
script record pending", so the record arrived before the engine's load events, and the trace's sendEvent counts show each blanked
event sent once more after the apply); H-R8 CONFIRMED (the late joiner's views played, "Trigger02 played (the script record" and
"Trigger03 played (the script record, taken", both pillars' Pillar01 at 0.0 rad of the host's). Supported, not isolated: H-R9 (the
lever's record was sent once more after a pull that changed no pillar, which its callerSelf touch makes due, though the 30 s sweep
could too); H-R10 (the stack ZeroFunctionArguments' re-sends ran, no fault). Unread: H-R11 and H-R12. The records also carried
scripted objects beyond the pillars (the Temple's 6a9e2, 67dcc, 3c5a9, 375a1, 375a2, 375ad), applied as guests with their handles
resolved, the system's own reach rather than a pillar case. The T3 box stays open on H-R9 to H-R12.

## Playtest 49 (21:13 to 22:57 PST 2026-11-06, 05:13Z to 06:57Z 11-07; fork m4-train-48 75c134ad under apocrypha's layer b2bcc92d)

Rung 3's record (458a6930, inside the train) in play at Bleak Falls Temple 0x371de; test 1 rotfern on c1 (ff000000), test 2
Ariadne on c2 (ff000001). The record: results/playtest-49/, and c1's console after its relaunch in
docs/private/playtest-49-c1-console-0614.log, stamped by c1's own clock; the server's times are UTC.

The pillars through a hand-off and a late arrival: VERIFIED IN PLAY. Eli: "alright pillars looked great". rotfern, hosting, set
all three to the whale; numidium relaunched c1 at 06:09:51Z; the records were served to Ariadne ahead of her grant (06:10:13Z,
epoch 2); c1, back in as a guest, applied all three and played each view from its record (H-R8's case: "object animation aa8cb
Trigger03 played (the script record, taken, after StartState03 taken)"); rotfern then turned 0xaa8cb as the guest at 06:11:23Z,
the host's RotatePillarToState relayed at seq 8.

The restart leg: BROKEN on the guest. Eli: "ohooooo interesting. for ariadne the pillars are accurate, but for rotfern they're
reset". The server restarted at 06:13:13Z and both seats were back online by 06:13:39Z; numidium teleported both out to the Temple
door's camp at 06:14:04Z and back to their spots in 0x371de at 06:14:24Z. c1's console at the reconnect (06:13:30.739, its apply
"at the grant of 371de"): "script state aa8cd: nothing blanked; view Trigger01 to play (seq 4, none here), +23 ms", aa8cc's
Trigger01 at seq 3 and aa8cb's trigger02 at seq 8 the same. After the teleport back (06:14:25.802, "applied as a guest", Ariadne
hosting): "script state aa8cd: blanked OnLoad and OnCellLoad re-sent; view Trigger01 current (seq 4), +1653 ms", and "current" for
the other two. The apply judged each view current from the 06:13:30 bookkeeping and played nothing, while the teleport out had
unloaded the 3D and it loaded again at its default faces; c1's two later loads of the cell (06:14:33 and 06:15:04Z) brought no
pillar apply line. Later relayed presses played on c1 ("object animation aa8cb Trigger03 played (relayed, taken, after
StartState03 taken)"). The cause, read from these lines: the "current" mark survives a 3D unload. The host's side held
(VERIFIED IN PLAY, "for ariadne the pillars are accurate"): rotfern's next press (06:15:15Z) turned 0xaa8cb from 'trigger02' to
'Trigger03' at seq 9, the turn from the record's side (numidium's notes, docs/private/playtest-49-findings.md).

The fix: fork m4-scripts-4-view b86884a5 (local, from m4-scripts-4-rows 10b3edcb). ObjectAnimationService keeps each world
object's last animation, the record's view or the newest relay, whichever has the higher sequence; a 3D unload drops the shown
mark, and a seat that does not host the reference's cell plays it again at every 3D load, with the line "[verb:scripts] object
animation <id> <event> re-applied at a 3D load (seq <n>)". HYPOTHESIS until a lab run reads the guest's pillar nodes equal to the
host's after a teleport out and back.

The Temple's cobwebs, the other world script 49 broke, and D-C2 A (a guest's trigger entry relayed to the cell's host through rung
3's SendScriptEvent, given the event's argument) are in traps.md's Playtest 49 section.

## D-C3, the record's view carries a world object's graph variables (ACCEPTED as A by Eli 02:2x PST 2026-11-07, thuum 2774cfb4; built on fork m4-train-50 b5e466a2)

The question (playtest 49; docs/verbs/traps.md "Playtest 49"): a script record's view carries a world object's last animation
event alone (rung 3's amendment A), and FXtriggerAmbFX tears a web with SetAnimationVariableFloat("fToggleBlend", 1.0) on itself,
no animation event, so each web's record reads view '' and a seat arriving after a tear, or one whose 3D reloads, gets the web
whole. (This D-C3 is the cobweb view's; docs/private/container-hold-scope.md's D-C3 is another memo's.) Eli's answer, verbatim:
"D-W2 A (provided it's not breaking what i verified DOES work, becuase last test did seem to work) and D-C3 A", with the decision's
rule 6 line: the change form's graphVariables merge to canon only with a committed restart scenario (b-cobweb-view's restart leg).
The build plan docs/research/fifty-fixes-2026-11-07.md's option A, as built (S4 439571f4, W1's graph_vars, C3 d25ce708 and
1149fd31):

- Server (S4): the three SetAnimationVariable rows (natives_table.rs:28-30 at the train's base 1acb834f, Keep::Nothing there; 39-41
  at fork m4-train-50 4bd07f33) take a new Keep::Variable, still relayed as actions, which keeps the call's (name, value) on its
  subject with the call's sequence (ScriptCallVerdict's keep_var); MpChangeFormREFR gains graphVariables, at most 16 per reference
  (a new name past that replaces the oldest), saved under the key "graphVariables" (an absent key reads as none and formVersion is
  kept, the fork's migration for a new field); BuildScriptStateApply copies the reference's current variables into the served apply,
  so a variable set after the record's take is served too (the plan's read 7: an owner reports a record only at a stack's end that
  moved the scripts' hash, and a stack whose only act is the set takes no new record). Graph variables are served only when the
  reference has a script record: BuildScriptStateApply returns false without one (its first test, the change form's scriptState),
  and both serves, behind a create word and ahead of a grant, ask for a record first, so a variable kept on a reference no owner
  ever recorded is relayed live by its call and saved, but never served to a late seat or a new host.
- Wire (W1, with SCHEMA_VERSION 40): ScriptStateApply 77 gains graph_vars, each {name, k (3 int, 4 float, 5 bool, ScriptVar's
  kinds), its one value, seq}, cap 16 (UNMEASURED); check_script_state_apply refuses an empty, NUL-carrying or repeated name, a k
  outside 3 to 5 or a payload not its k's, a seq of 0 (E_VAL_RANGE) and a float that is not finite (E_VAL_NONFINITE).
- Client (C3): ScriptStateService sets each served variable whose seq is above this seat's kept seq for (reference, name), through
  the platform's own setAnimationVariable calls, before the view's replay; ObjectAnimationService keeps the variables beside the
  last animation and sets them again at each 3D load; SpSnippetService routes a relayed SetAnimationVariable call with a seq on a
  game-file reference through the same keep.
- The hypotheses: H-C3a, a SetAnimationVariableFloat("fToggleBlend", 1.0) on a guest's untouched web shows it torn (HYPOTHESIS;
  x-trigger-entry v1's W2 screenshots, then x-cobweb-view v1); H-C3b, a graph variable goes with its 3D and needs setting again at
  the next load (HYPOTHESIS; x-cobweb-view v1's reload leg).
- The proof: x-cobweb-view v1 (lab/.cache/drafts/fifty: a seat that missed a tear sees the record's variable set when it arrives
  and again after it leaves and comes back) and b-cobweb-view v1's legs 2 and 3 (the late arrival, then rule 6's restart for the
  "graphVariables" key). The value a seat's engine holds is recorded, not claimed, until lab-api grows a view of the graph-vars step;
  the claims read the server's serve line (its variable count) and C3's two lines below.
- The built lines the probes count (x-cobweb-view v1.1, b-cobweb-view v1.1): the serve's "... view '<e>', <n> graph variable(s)"
  (PartOne.cpp), C3's "[verb:scripts] script state <id>: <n> graph variable(s), <set> set, <waiting> kept for its 3D, <current>
  current" at a record's apply, and its "[verb:scripts] object animation <id> <name> <value> re-applied at a 3D load (graph
  variable, seq <s>)" at a waiting variable's 3D load; x-cobweb-view's own proposed line was not the one built, so v1.1 counts
  these.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (CommonLibSSE-NG ObjectTypeInfo.h, VirtualMachine.h; the fork's Offsets.h)
- [x] server logic + T0: none, no server half (ADR-044)
- [x] message + validator (same commit): no new message
- [x] native hook + T1 (fork m2-train-29 bfbed728, merged to parity 7293c944 on 2026-10-20 13:40; T1 is the Windows build's, green)
- [x] TS handler: none
- [x] T2 green: no wire change
- [ ] T3 scenario green, no HYPOTHESIS tags (b-papyrus-events approved by Eli 2026-10-20 and on main, d1d8370, asserting the Creation's check ran connected with the prompt flag from the per-player default; its first run is the layer-merge sweep; x-mcm-register's HUD count still to read)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031): not applicable, no player action
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (no server native; the Suppress section above is the registry entry; slice 1b's 24 hooked natives are named in NATIVES.md's hand-maintained Reason column with the hook's rung R2 and the verb papyrus-events; the Rung COLUMN stays the server VM's own rung (R0 where the server implements the native: Enable, Disable and their NoWait forms, Activate, Delete, SetOpen, Lock, SetLockLevel; PlaceAtMe's delegation keeps Eli's R0 row), the hook's R2 in each Reason text, 19:55 PST 2026-11-02)

Play: BROKEN, playtest 41 (2026-11-02, LOG 16:53): at Bleak Falls the world scripts the layer's host row did not name never ran
(six the row lacked): the spider froze, Arvel never fell, the draugr waited to be hit; ADR-062's slices replace the row.

## The committed scenarios of rung 4 and the 50 train (02:59 PST 2026-11-09, thuum-fa)

Each committed alone after its own green (rule 13), each named here so the gate's touched set finds its verb:
- b-world-global (thuum daf97fe2): rung 4's WorldGlobal 80, rule 6's restart scenario: the elected streamer's write reaches every
  seat, survives a restart, and another seat's write does not move it. Green 20261107-214047 (v1.1, the login race's winner
  handed to c1 by c2's relaunch).
- b-ref-state-restart: rung 4's RefState, rule 6's restart scenario: a host's scripted Disable reaches a late joiner and a
  restarted server (its served word behind the create word, and since fork e4752b05 at a primitive's subscribe). Red
  20261107-211516 on the gap e4752b05 fixes (a trigger with an XPRM box got no create word, so no serve); its rerun on
  m4-train-50 ce0d2664 decides; committed when green.
- b-pillar-reentry (thuum 21e1d72a, promoted from x-pillar-reentry v1.1): playtest 49's restart break, the guest's pillars after
  a server restart and a teleport out and back (the view re-applied at every 3D load on a non-owner, fork bb24886d). Green
  20261107-212822 and 20261108-000917.
- b-login-in-cell (thuum 15608f42, promoted from x-login-in-cell v2.1): ADR-068's D-L1 B, a login inside a cell gets that
  cell's OnCellAttach and OnCellLoad once (fork a7a3854c). Green 20261107-213324 and 20261108-001509.
- b-cobweb-view (thuum a4b5fb05): D-C3 A, rule 6's restart scenario for graphVariables (also named under D-C3 above).
Their verbs' others: b-trap-look in trigger-entry.md, b-lever-relay in furniture.md.
Not a committed scenario, by W3: the standing (rung 4's faction rows, MECHANISM ONLY until content presses it) and the
libespm fix its base reads (fork f9e09f01: an NPC's faction rank at SNAM's offset 4, not 0) are guarded by T0 (StandingTest,
and EspmTest's rank guard on 0x1000ef) and read on the lab by the probe x-standing v1 (5fbfa28e), GREEN 20261107-205305 on
rung 4's stage; a b-standing is promoted when content presses the standing.

## ADR-068 rung 5, D-R1 C: a script's grant to its own player is the seat's own record (Eli 2026-11-10; fork m4-scripts-5-rewards 1bc4059b, on m4-scripts-5-second 685f6a24; its stack cap f3a2a44c, at f6ca339d)

Eli's word (docs/DECISIONS.md, rung 5's stage-eve words, verbatim for this item "im thinking C because it's the most likely to
fire every time"): a script's AddItem or RemoveItem on the seat's own player is recorded into the player's inventory as the seat
reports it, with no property bound, because it fires every time (a bound would refuse a leveled reward or an item a script
computes at run time). Found by x-acting-frame 20261110-072506: A Lovely Letter's 25 gold (Gold 0xf) undone about 2.4 s after the
grant by the client's 5 s inventory apply, since nothing told the server of it.

- The rows: the flip's ObjectReference.AddItem and RemoveItem keep their places with Owner::Player and Keep::Record(PlayerOwn)
  (natives_table.rs:62-63; NativeRows.inc:30-31 unchanged, having no owner or keep column), so a player's own rows are nine
  (wire-rules player_own's ROWS, the two first). On any other subject neither has a channel (record_owner's E_SCRIPTCALL_ROW).
- The judgment, no property bound (player_own.rs:410-455 at f6ca339d): the form an item of libespm's item types (E_SCRIPTCALL_ARGS
  otherwise: a FormList, a reference); a leveled list's add refused by name (E_SCRIPTCALL_LEVELED: what landed is the engine's
  roll, which the report does not carry, so the record never holds the list's form); the count, aiCount, a whole number from 1 to
  2147483647, a Papyrus Int above zero (item_count :145-158, E_SCRIPTCALL_ARGS otherwise); an add recorded whole, at most to the
  record's u32 bound over the form's stacks, and, since fork m4-scripts-5-review f3a2a44c (Fix B, merged at m4-scripts-5-second
  f6ca339d; the second head's fresh review found a seat could mint a stack of any item at the native's rate with no limit on their
  number), refused when it needs a new stack once the record holds 4096 (E_SCRIPTCALL_FULL, :433-435, after the leveled, kind and
  count refusals): INVENTORY_STACKS (:90-95), the wire's stacks in one inventory (wire-schema cap::INVENTORY, lib.rs:165;
  wire-bridge's test holds the two equal, rules.rs:6915-6928), so the player's SetInventory and CreateActor still carry its whole
  inventory past the server's edge (wire-schema skymp.rs:135's Inventory, a bounded Vec that refuses a longer one, bounded.rs:1-5,
  E_WIRE_CAPACITY); a removal at most what the record holds, one of what it lacks folding, the open race overlay's item first (the
  werewolf's RemoveItem of WolfSkinFXArmor ahead of its race's return), and folding into a container the player holds open (that
  container's PutItem moves the item, both sides); Fix B bounds no removal.
- The core (ActionListener.cpp RecordPlayerOwn :4740, its facts :4831-4860, its inventory branch :4906-4936, at f6ca339d): reads
  no attachment for the two, gathers the facts (LVLI by the record type, Inventory::GetItemCount, the second argument, since Fix B
  the record's stacks and whether a plain add of the form joins none of them, Inventory::Entry::EqualExceptCount against the form
  with no extra data, Inventory::AddItems' own match, :4840-4852, and MpObjectReference::IsContainerOccupant of the fourth) and
  writes MpObjectReference::AddItem, or RemoveItems over StacksToRemove (:4661-4691: the plain stack first, each stack as the
  record holds it, so RemoveItems never throws), whose SendInventoryUpdate sends the player its inventory at the tick; nobody else
  hears it. Line: "[verb:quest-stage] <player>'s own ObjectReference.AddItem <form> (from <caller>.<handler>): <n> added to its
  inventory as its seat reported it (D-R1 C, R2), <m> held now"; Fix B's refusal, one line a minute per seat and code
  (unit/PlayerOwnTest.cpp :718-784): "[verb:quest-stage] E_SCRIPTCALL_FULL: <player>'s own ObjectReference.AddItem <form> (from
  <caller>.<handler>): the player's record holds its cap of 4096 stacks (the wire's in one inventory) and <form> would need a new
  one: nothing is written; refused, <n> since the last line".
- The platform: the two are batched on the seat's own player alone (ScriptNatives.cpp kBatchedStateRows :222-223, the batch's
  test :1905-1906), and the recorded lever keeps their latent rule (SkipsBody :918-933), so a non-owned call on a container, an
  NPC or a figure runs its body as before; inside another player's acting scope the self is that player's figure by step (0),
  never 0x14, so a relayed fragment's grant crosses once, from the acting seat.
- The client: ScriptCallService sends them as the seven go (its own family, selfId 0x14, unfolded) and holds each item's base
  against remoteServer.ts's 5 s inventory apply from the call's arrival in JS until 10 s past its send (scriptCallService.ts
  holdOwnItem :342-357; remoteServer.ts holdPcInventoryBase :93-120, keepSurplus for an add and keepDeficit for a removal), so no
  apply undoes a grant before the server's SetInventory carries it into pcInv; a leveled list's id names no inventory entry and
  holds nothing.

**R2, unvalidated (rule 5), declared here:** the seat's word that its script made the call. The server checks the kind, the
count's bound, the record's room (the u32 count over the form's stacks and, since Fix B, 4096 stacks) and, for a removal, what the
record holds and whether the other container is held open, and nothing else: no property bound, by Eli's choice, so a modified
seat can add any item of any count to its own player by reporting a call, in at most 4096 stacks, and nobody else hears it (a
player's inventory goes to its own game alone). Named gaps: a leveled reward (refused by name, its roll reverted at the next apply
as before; its landing read by the trace below, the fix is train 52's); AddItem of a reference or a FormList and RemoveItem of a
FormList (no item record, E_SCRIPTCALL_ARGS); a removal's receiving side (the container or the NPC); and a reward a giver moves
into the player (RemoveItem on the giver: the giver's row, no player's own). T0 player_own's cases (the count's bound, a grant as
reported with no bound, the u32 room, the leveled, kind and count refusals, the removal's clamp, the held-open fold, the skin
taken from the overlay, and Fix B's: a new stack refused at the cap, a join at it and a new stack one short of it recorded, the
earlier refusals keeping their names, a removal never bounded by it), wire-bridge's (INVENTORY_STACKS equal to cap::INVENTORY,
E_SCRIPTCALL_FULL across the bridge) and unit/PlayerOwnTest.cpp's five (0xf x25 recorded once and heard by its own game alone;
LItemFoodCabbage75 0x10bf6a E_SCRIPTCALL_LEVELED; the chest 0x20570 held open folds, shut records; Fix B's, a record at 4096
stacks, a plain gold stack beside 4095 tempered iron daggers 0x1397e: a plain dagger's add and a lockpick 0xa's refused
E_SCRIPTCALL_FULL in one line, the gold's add joining its stack recorded at the cap, a removal freeing a stack the lockpick then
takes).

**The leveled gap's trace (rule 8's Dynamic plan, run: x-additem-functor 20261110-151634, GREEN).** The question: when a script's
AddItem on the player names a leveled list, does the rolled item reach the player through a TESContainerChangedEvent fired
synchronously inside SkyrimScript::AddItemFunctor's operator(), carrying the same stack id as the call the seam recorded? Yes.
x-additem-functor 3aebdf11 (by path, lab/.cache/drafts/rung5; c1 alone at Riverwood's landing) ran on canon (server image
m4-scripts-5-quests, client 44ffafc2) with lab/frida/additem-functor.js (thuum main c031c55d; attach only; the functor's vtable
slot 01 read live at load, agreeing with the type's RTTI and with the static read). Its six AddItem calls: MS01 0x18b4b's
Fragment_56 and Fragment_62 (stages 39 and 49), each LvlQuestReward02Medium 0xc0405 x1 on 0x14; FreeformStonehillsA 0x64958's
Fragment_2 (stage 20, the control), Gold001 0xf x25 on 0x14; and CarryFurnitureScript.OnAnimationEvent's three of 0x6f993 x1 on
0x1348c, a world script's.

- The call: each returned kInProgress, its stack waiting on the latent function, with no container event inside it
  (NativeFunctionBase::Call's own window).
- The functor: 3.0 to 3.4 ms later its operator() (slot 01 of VTABLE_SkyrimScript____AddItemFunctor, CommonLibSSE-NG
  Offsets_VTABLE.h:4616, DelayFunctor.h:35) ran on a worker thread, never the main one (9432 in that game), two of the six on the
  call's own thread and four on another; its stackID (DelayFunctor.h:43, +0x0C) was the call's stack's (Stack.h:80, +0x80) six of
  six, CarryFurnitureScript's three calls on one stack, 7819, each matched in turn (the stack waits on its latent call, so one id
  names one pending call); it returns its Variable through a buffer (rax equal to rdx at entry, six of six).
- The event: inside each operator(), on its thread, one TESContainerChangedEvent, seen by the VM's sink and the platform's: each
  leveled call's roll, Gold001 0xf x400 into 0x14 (the list's level-1 entry, the probe's read of its LLCT); the control's 0xf x25;
  the furniture's 0x6f993 x1 into 0x1348c; none naming the list itself. Leg 0's flora harvest (Activate on 0xec85c) landed its
  0xec870 x1 inside the Activate call, outside any functor, so the functor's window keeps a harvest out of the join.
- Beside it: canon has no D-R1 C, so each grant to the player went back out (0x14 to none, the same base and count, outside any
  window, 1.6 to 4.5 s after it, the 5 s apply's shape x-acting-frame named; the trace hooks no RemoveItem, so the remover is
  UNVERIFIED), and the server's gold read 140 at all three snapshots.

**The fix's observe point (built in train 52, below).** CommonLibSSE-NG's REL::Relocation::write_vfunc (Relocation.h:392, :402) on
slot 01 of VTABLE_SkyrimScript____AddItemFunctor (Offsets_VTABLE.h:4616, AE id 218372): a thunk `Variable* (DelayFunctor*,
Variable*)`, the return buffer the trace read, that holds the functor's stackID in a thread_local around the original.
skyrim-platform's EventHandler::ProcessEvent(TESContainerChangedEvent) (EventHandler.cpp:376-393 at f6ca339d) reads it before
AddUpdateTask (:393), the event still on the functor's thread, and joins the event to the seam's pending call of that stack id
(ScriptNatives.cpp QueueFromFrame :994, its `call.stackId = stack->stackID` :1007); the report carries the event's base and count,
and the server records the roll where E_SCRIPTCALL_LEVELED refuses today. If the report carries them in a new field, its message,
validator and fixture move in the same commit (rule 4). Until it lands, E_SCRIPTCALL_LEVELED stands. The trace's rule-2
correction: docs/research/adr062/papyrus-native-entries.md:134-139's "the functor's operator() on the main thread" is false (its
corrections section).

HYPOTHESIS H-RW1: the client's hold keeps a grant: holding the item's base until 10 s past the report's send keeps the 5 s
inventory apply from undoing it before the server's SetInventory carries it into pcInv, and an apply that ran in the frame before
the hold is healed by that echo (A Lovely Letter's 25 gold kept on the acting seat reads it; the trace ran on canon, without the
hold, so it reads nothing of it).

H-RW2 CONFIRMED as a mechanism by x-additem-functor 20261110-151634 (above): a leveled list's roll lands through a
TESContainerChangedEvent inside AddItemFunctor's operator(), on its thread, with the stack id the seam recorded at the call.
Nothing read it at f6ca339d, so E_SCRIPTCALL_LEVELED stood until train 52 built the observe point above (the next section).

## Train 52: a leveled reward lands with its roll, an effect places its own helper, a server snippet finds its actor (fork m4-train-52 c3f9d175, on m4-scripts-5-second f6ca339d; built 2026-11-11, T3 pending)

Train 52 (its plan, gitignored: lab/.cache/drafts/train52-plan.md, sections 1, 2 and 4.2; its own decisions D-R2 B and D-H1 B,
defaults Eli may overturn at review, docs/DECISIONS.md's ADR-068 train 52 entry) is pushed with its pipelines green: 5795 at
ff467dab (the one Windows build, client-build 20605 and server-build 20604) and 5797 at c3f9d175 (server-build 20609, the T0
below); the client and platform trees are the same at both. Its lab stage follows playtest 51. No seat has run it, so each lab
claim below is built and T3 pending, with the probe that reads it (by path, lab/.cache/drafts/train52, each READY from its fresh
review: x-leveled-reward v1 d88b5741, x-effect-helper v1 6516c470, x-acting-player v3 367ecd50), or HYPOTHESIS; the run ids follow
the stage's green. Line numbers are c3f9d175's.

**Fix 1, the leveled landing (D-R1 C's named gap; the observe point above, built as the trace read it: park, note, close).**
- Park: OnCall's step (e) parks an AddItem on 0x14 whose first argument's form is a leveled item (CommonLibSSE-NG
  include/RE/F/FormTypes.h:193), the switch on, by its stack id instead of queueing it (ScriptNatives.cpp:2593-2610). The park
  table (:1244-1294): its own mutex, its size in an atomic for the lock-free test, at most 64 calls, each let go with a line 60 s
  after its park when no functor ran (a killed stack, a load mid-wait; 60 s so a VM a menu holds back keeps a real reward,
  UNMEASURED), swept from Tick and cleared at a load. A stack waits on its latent call, so one stack id names one parked call.
- Note: Hooks.cpp's AddItemFunctorCall (:244-304, installed from Hooks::Install :614) writes slot 01 of
  VTABLE_SkyrimScript____AddItemFunctor (Offsets_VTABLE.h:4616, AE id 218372; DelayFunctor.h:35) through
  REL::Relocation::write_vfunc and opens ScriptNatives::FunctorWindow (ScriptNatives.h:57-81) for the functor's stackID
  (DelayFunctor.h:43) around the original. operator() returns BSScript::Variable by value, so the thunk takes `this` in RCX and
  the return buffer in RDX and returns the buffer (the Microsoft x64 convention for an instance method; the trace's rax equal to
  rdx, six of six). The TESContainerChangedEvent sink calls NoteContainerChange on the event's own thread (EventHandler.cpp:396;
  ScriptNatives.cpp:3162), one thread_local read outside a window (rule 9), which folds each new item (no old container) into the
  call's self by base, its count summed with saturation, at most 255 bases; a base past them, or at or above 0xff000000, is
  counted and never sent. Slot 01's target: UNVERIFIED (Ghidra), the trace's live read standing in.
- Close: the window's end queues the call into the batch with `landed` (CloseParked, ScriptNatives.cpp:1419-1452), and the
  platform's line says what landed, the first 64 and every hundredth: "[verb:scripts] own ObjectReference.AddItem <list> on 14
  (from <caller>.<handler>), stack <id>: its roll landed <k> base(s) in its AddItemFunctor (<base> x<n>, ...), reported with the
  call", or "...: its roll landed nothing in its AddItemFunctor, reported with an empty landing". A parked call whose native
  answered anything but kInProgress queued no functor and is let go (:3108-3115, "the native completed with no functor"), one line
  a minute with the count. The switch scriptLeveledLandings (on unless false in skymp5-client-settings.txt; ClientSetting
  :2742-2790) is the lab's A/B: off, nothing is parked, the call crosses at its call and the server refuses it
  E_SCRIPTCALL_LEVELED as before; the install line names what the slot held (:3377-3383).
- The client (5ee97fef): ScriptCallService holds each landed base's surplus against the 5 s inventory apply for an AddItem that
  carries `landed`, in place of the list's id, which names no inventory entry (scriptCallService.ts holdOwnItem :351-367), and
  sends `landed` as { item, count } (:510-511).
- The wire (4b5d9950, rule 4's one commit): ScriptCall 75's optional `landed`, SCHEMA_VERSION 44, at most cap::SCRIPT_CALL_LANDED
  255 landings (a leveled list's entry count is one byte, TESLeveledList.h:72), checked at the edge by wire-validate's
  check_landed (docs/WIRE.md's ScriptCall section: the codes, fixture 75-ScriptCall-5).
- The server (9d635d6b, D-R2 B): RecordLandings (ActionListener.cpp:4729-4888), called from RecordPlayerOwn for an AddItem that
  carries `landed` (:4953-4960), takes the call's form as the list (an LVLI, else E_SCRIPTCALL_ARGS, "its <k> landing(s) land on
  no list") and judges each landing as a plain add of its base after one check: wire-rules player_own's items() (:448-451) refuses
  first a base the list cannot roll, E_SCRIPTCALL_ROLL, "<base> is no base the leveled list <list> can roll (its entries, nested
  lists followed): that landing is not recorded". The reach is LeveledListUtils::Reach (LeveledListUtils.cpp:194-237): each
  entry's form id made global as EvaluateList makes it, nested lists followed to kReachDepth 16 with a set of the lists walked so
  a cycle ends, an entry no record answers skipped, each base once and never a list; PartOne::LeveledReach keeps each list's reach
  sorted for a binary search (PartOne.cpp:4567-4583, cleared at AttachEspm). E_SCRIPTCALL_LEVELED stays for a leveled call that
  carries no landing (player_own.rs:452-454, the seat's switch off), its why saying so. No new persistence: the inventory is the
  change form's, recorded already (rule 6 not engaged).
- The one-edit write (1a70a16b; the whole-branch review's SHOULD 1, server work amplification): the record budget spends one token
  per call (wire-rules natives' BURST_RECORD 128 at once and PER_SECOND_RECORD 32 a second, natives.rs:945-949) and a call carries
  up to 255 landings, so 9d635d6b's write, a plain AddItem per landing (the facts' scans of the stacks, a change-form edit whose
  save request copies the whole change form, a serialization of the whole inventory), bought up to 255 plain AddItems' work with
  one token, and a modified seat can name that many bases a list can roll (215 of the 3,812 LVLIs of the lab's cached Skyrim.esm,
  Dawnguard.esm and Dragonborn.esm reach 255 or more, 141 of the 3,075 numbered in Skyrim.esm; LootWarlockChestBossBase 0x3515e
  reaches 4,013; lab/esm.py's walk, c3f9d175's T0 comment). Now the record's facts for every landed base are read in one pass and
  carried forward as the call's accepted landings move them (each judged as a plain AddItem would be after the ones before it, Fix
  B's 4096 stacks counted landing by landing), and the accepted landings are written with one MpObjectReference::AddPlainItems
  (MpObjectReference.cpp:1302-1316: one EditChangeForm, so one save request, one SendInventoryUpdate, then one OnItemAdded per
  landing in order; Inventory::AddPlainItems, Inventory.cpp:116-151, AddItems' own result for plain items): per call one plain
  AddItem's work plus a constant per landing, with no wire, rule or budget change. Every OnItemAdded now fires with the whole roll
  in the record, as the engine's own events reach scripts after its functor. The success line is bounded too, the first eight
  landings named and the rest counted (ActionListener.cpp:4859-4887): "[verb:quest-stage] <player>'s own ObjectReference.AddItem
  <list> (from <caller>.<handler>): its roll landed <base> x<n>[, ...][ and <k> more base(s)], added to its inventory as its seat
  reported it (D-R1 C, R2; each a base the list can roll, D-R2 B), <m> of <base>[, ...] held now", or "...: its roll landed
  nothing".
- A correction (rule 2): the plan (section 1.8) read LItemJewelryRing 0x8757e as ten bases; Skyrim.esm has 32 entries of eight
  rings (lab/esm.py on the lab's cached copy, 2026-11-10; LVLF 0x03), so LeveledListUtilsTest names those eight, each an ARMO, and
  pins no total (Update.esm is not in that cache).

T0 (CI, pipeline 5797): wire-validate's cases and proptests and wire-codec's bound (docs/WIRE.md); player_own's (a landing in
reach recorded whole, out of reach refused Roll ahead of every other judgment, the unreported call keeping Leveled, Full at 4096
stacks, the u32 room) and the bridge's; unit/PlayerOwnTest.cpp on Skyrim.esm (MS01's LvlQuestReward02Medium 0xc0405 x1 with
`landed` [{0xf, 400}] records 400 gold once, its own game alone hearing it; [{IronSword 0x12eb7, 1}] refused E_SCRIPTCALL_ROLL in
one line; [] writes nothing and says so; no `landed` keeps E_SCRIPTCALL_LEVELED; 255 landings of LItemSpecialLoot100 0x1031d0 into
an emptied record, every one in the record before the first of the 255 OnItemAdded, one success line ending "and 247 more base(s)"
and one SetInventory; the same call into 3,996 tempered daggers, 100 recorded and the rest E_SCRIPTCALL_FULL in one line);
unit/LeveledListUtilsTest.cpp's Reach (0xc0405, and FavorRewardGoldLarge 0x4a41b through LvlQuestReward03Large 0xc0406, each
{Gold001}; the eight rings; a non-list form nothing); unit/InventoryTest.cpp (AddPlainItems equal to AddItems, a named case and
2,000 seeded ones). T2: the difftest session player-own-items (new, docs/WIRE.md), its run pending. T3: x-leveled-reward v1 (c1
alone at Riverwood's landing, the stages set by the driver: MS01's 39 and 49, the control FreeformStonehillsA 20's Gold001 x25,
FreeformRiften12 25's ring, Lucan's MS13 100, then a relaunch); b-leveled-reward is promoted from it after its green, in its own
commit (rule 13).

**R2, unvalidated (rule 5), declared here for the landing:** the seat's word that its engine's roll landed these bases. Checked:
the shape at the edge (an AddItem on 0x14 alone, load-order items, counts above zero, each base once, at most 255), each base
against its list's reach in the game files (D-R2 B), and each landing as a plain add (its kind, the count's bound, the u32 room,
Fix B's 4096 stacks). Not checked: that a roll happened. A modified seat gains nothing D-R1 C does not declare already (it can
report a plain AddItem of any item), and the reach makes a forged leveled report no wider than its list: a consistency check,
never a security bound. For a call that carries its landing this closes the leveled gap the declaration above names; a call that
carries none keeps it.

HYPOTHESIS H-LR1 to H-LR4, the plan's 1.10 (ScriptNatives.cpp:1268-1272 and ScriptNatives.h:68-70 carry them): H-LR1, a list that
rolls several entries (LVLF 0x04 use all, or 0x02 each item in count) lands every entry inside the functor (the trace read
one-entry rolls and so do x-leveled-reward's legs, so its read is the plan's Dynamic, a census of the 130 stage fragments that
AddItem a leveled list on the player for one whose list rolls several, then a leg on that stage); H-LR2, no plugin rewrites slot
01 after the thunk's write (the read-back's warn line at the first park, ScriptNatives.cpp:1360-1362; the install line and claim
8's expiry count); H-LR3, operator() and its events run on one OS thread (claims 1, 2 and L2); H-LR4, the functor runs within 60 s
while a menu is open (unread: no menu opens in the probe); H-RW1, inherited (the hold keeps a landing from the 5 s apply; claims
7, 9 and L4).

**Where the reach could refuse a genuine roll (the whole-branch review's SHOULD 2): two cases, HYPOTHESIS both.** D-R2 B refuses
no genuine roll only while the server's reach is the engine's list.
- HYPOTHESIS H-LR5, an entry a script added at run time: LeveledItem.AddForm adds an entry to the engine's list, and the entries
  it adds persist through a save and its reload until LeveledItem.Revert removes them (Creation Kit wiki,
  https://ck.uesp.net/wiki/LeveledItem_Script and https://ck.uesp.net/wiki/AddForm_-_LeveledItem; both answered 403 to the
  fetcher, read from the search index's summary). The reach reads the game files alone, and AddForm is no row of the seam and is
  missing on the server VM (docs/NATIVES.md), so a roll that lands a script-added base is refused E_SCRIPTCALL_ROLL and the 5 s
  apply takes it back, as before train 52. The read that decides it: a census of the load order's scripts that call
  LeveledItem.AddForm (lab/tools/papyrus-census.py's string-table read for the name, then lab/pex.py's disassembly for the
  receiver's type) and the lists they grow, against the reward lists the stage fragments name.
- HYPOTHESIS H-LR6, an entry followed by its COED: libespm reads a list's LLCT count and then that many 18-byte LVLO subrecords as
  one contiguous array from the byte after LLCT (libespm src/LeveledListBase.cpp:22-24; the Entry, LeveledListBase.h:22-29 and
  :45), while the record's grammar lets an optional COED (owner, global or rank, item condition) follow each LVLO: xEdit's LVLI
  definition makes each entry a struct of its LVLO and a COED (TES5Edit dev-4.1.6 d1960eaf, Core/wbDefinitionsTES5.pas:8026-8045),
  the engine's LEVELED_OBJECT keeps it as itemExtra (CommonLibSSE-NG include/RE/T/TESLeveledList.h:23), and UESP's COED page names
  LVLI among the records it is associated with (https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format/COED_Field; its LVLN page's
  COED row: "Can appear after each LVLO, only used once (LCharHagravenCompanion)"). A COED is 18 bytes with its header, an LVLO's
  size, so each one inside the run libespm reads is taken as one more entry (its global or rank read as a form id) and pushes one
  real entry off the end: Reach misses the list's last entries, and a genuine roll of one is refused E_SCRIPTCALL_ROLL. The
  server's own rolls read the same array (EvaluateList, LeveledListUtils.cpp:33 and :49-53). The read that decides it: a COED
  census of the masters (lab/esm.py over Skyrim.esm, Update.esm, Dawnguard.esm, HearthFires.esm and Dragonborn.esm: every LVLI or
  LVLN with a COED anywhere but after its last LVLO). None, and H-LR6 is moot for the masters; any, and the fix is libespm's
  reader (the subrecords walked one by one), with its T0 on that list.

**Fix 2, an effect's local helper (ADR-068 decision 6, D-S2 B, D-H1 B; ea6da0a1; docs/verbs/second-hand.md's H1).** The seam
judged a call by the object it is called on, not by whose effect runs it: WB_CrackleNew_Script's OnEffectStart places TheBox =
akTarget.PlaceAtMe(FXEmptyActivator) at its target, c2's figure, which no seat hosts, so the nonLatent lever skipped it with None
returned (CONFIRMED in reds 20261110-043108 and 062541) and RemoteCast had no source. The rule, in two clauses:
1. Creation inside the player's effect (ScriptNatives.cpp:2525-2560): a PlaceAtMe the owner test refused, of an activator, a
   static or a light (D-H1 B; FormTypes.h:164, :174 and :171; HelperBaseOfArg0 :2224-2242), on a stack whose root frame's self is
   an active effect this seat runs for its own player, its target or its caster (EffectPlacementOf :2244-2280), runs its body,
   counted " (effect)", and the reference it returns (stack->returnValue once the original answers kCompleted, NoteHelper :3034)
   is this seat's local helper. The effect test is the Papyrus gate's own, moved into Frida::PlayersEffect
   (FridaHooks.cpp:892-921: HandleIsType(ActiveEffect::VMTYPEID 142), GetObjectForHandle, the target against the player's
   AsMagicTarget first, then GetCasterActor; CommonLibSSE-NG ActiveEffect.h:31, :100 and :104) and called by both, the gate's
   behavior and order unchanged (:1361-1370). Line, the first three selves per row per census window: "[verb:scripts]
   ObjectReference.PlaceAtMe on <self>: run inside this seat's own player's effect (<Script>.<Function>, the player its
   <caster|target>), its helper <base> (<ACTI|STAT|LIGH>) kept local here (ADR-068 decision 6, R3)".
2. A helper is its creator's (:2483-2509): any tabled row on a non-actor at or above 0xff000000 the helper table holds runs here,
   counted " (helper)", and crosses nowhere (never batched, touched or relayed; an action row under the script action's mark, so
   the engine-level animation hooks leave it too); a PlaceAtMe on a helper of a helper's base makes another helper (TheShooter at
   TheBox), and a Delete lets one go. Line: "[verb:scripts] ObjectReference.<fn> on <helper>: a helper this seat's own player's
   effect placed, run here and kept local (R3)". The table (:1043-1140, ActingScope.h's idiom, game-free): a helper counts only
   while its reference's base is the recorded one, so a recycled dynamic id never inherits it; 10 minutes, at most 256, the oldest
   first, cleared at a load (ScriptNatives::ClearAtLoad, from PapyrusTESModPlatform.cpp:153).

Everything else on another owner's object keeps its judgment: a PlaceAtMe of an NPC, an item, a container, furniture, a door, an
explosion or a hazard, and every other row. The switch scriptEffectHelpers (on unless false), its install line at :3353-3356.
**R3, declared here:** a helper is client-local and every seat that runs the effect makes its own; nothing crosses (no helper is
batched, and wire-validate refuses a subject at 0xff000000 and up in any case), and the consequence that matters, the proc's hit,
keeps its channel, the caster's OnHit under second-hand's claim. No wire, server, NativeRows.inc or natives_table.rs change and no
new native (rule 10 not engaged); no T0 or T2 (the seam has no Linux harness; the helper table and the line slots ran in a scratch
test). Known limit, named: on the effect's target's own seat the first PlaceAtMe's subject is that seat's own player, an owned
subject, so TheBox is placed as before and is no helper there; TheBox.PlaceAtMe on it, in a cell that seat may not host, takes
clause 1 (the player the target), so only TheShooter is a helper there, and TheBox's own latent Disable and Delete keep the owner
judgment. HYPOTHESIS H-EF1: an effect event's stack roots at the ActiveMagicEffect script's handler with the effect's object as
its self (x-effect-helper's claim 1). HYPOTHESIS H-EF2: PlaceAtMe's result is in returnValue when the original answers kCompleted
(claim 3's helper row). HYPOTHESIS H-EF3, inherited: the call order inside OnEffectStart (numidium's pex read; claims 1, 3 and 4).
T3: x-effect-helper v1 on b-second-hand's frame (c1 casts Crackle 109653 at c2: the effect line, no skip line, the census's effect
and helper rows, the proc's stream on the server), and b-second-hand itself, unchanged, which leaves lab/gate.yaml's pending list
on its green. The class's other second-hand spells place their helpers too, so their procs reach the server again: new claims,
possibly new reds, so b-cloak-apply and b-cloak-fight run in the stage.

**The snippet's ids (24448f7b, client; d9b8554d, server; the plan's 4.2, stage 2's read of x-acting-player 20261111-034406).**
- The long-id fallback: the server writes a game-file actor it holds by its long id, the form id plus 0x100000000
  (SpSnippet::MakeLongFormId, SpSnippet.cpp:134-148: a snippet's self at MakeMessage :97-98, an object argument through
  SerializeArguments, RecordStanding's object_ and PartOne's login serve of the standing), and runMethod resolved it through
  remoteIdToLocalId, which sends every id at 0xff000000 and up to the view. Since fork daa46851 (2026-10-21, npc-puppet's Stage 1)
  a game-file actor travels under its own form id and its FormView keeps that short id, so no view answered a long id on any seat,
  a puppet's or a host's: the view gave 0, Game.getFormEx(0) was null and runMethod threw "Unable to find form with id 0" (c1's
  relayed SetRelationshipRank on Faendal, 0x10001348c), a line on that client's console and nothing sent back (the catch at
  spSnippetService.ts:108-110 answers no FinishSpSnippet). So from daa46851 to train 52 every server snippet whose self or object
  argument was a game-file actor failed on every seat with the server never told: the standing's appliers (SetFactionRank,
  RemoveFromFaction, RemoveFromAllFactions, SetCrimeFaction, SetRelationshipRank), relayed and served at login, and the server
  VM's actor-self snippets (PapyrusActor's DelegateToHost for SetActorValue, ModActorValue and ForceActorValue, SetAlpha to the
  listeners, PapyrusObjectReference's SetPosition and an explosion's PlaceAtMe); NATIVES.md's CONFIRMED for SetActorValue's
  delegation (x-av-probe 20261008-101643) predates daa46851 and is stale until a read after train 52. The fix, client only:
  worldViewMisc.ts's gameFileIdOfLongId (:54-57, MakeLongFormId's inverse, 0 unless the carried form id is 1 to 0xfeffffff) and
  snippetIdToLocalId (:71-73, the view's answer first, as remoteIdToLocalId's, then the game-file reference the long id names,
  which every seat's engine has from the same files); remoteIdToLocalId is unchanged, its other callers reading 0 as not in my
  view. SpSnippetService resolves runMethod's self, every object argument (deserializeArg, for runMethod, runStatic and
  SkympHacks) and SetDisplayName's self through it (localIdOf :443-449), and a fallback says so, the first three a minute for each
  long id (sayGameFileReference :451-470): "[verb:scripts] snippet <Class>.<fn> on <short>: no view holds its long id <long>, run
  on the game-file reference", an argument's "snippet <Class>.<fn> with <short>: ..., passed the game-file reference". Rule 5:
  nothing new (server to client, the server's own word).
- The listener's own player (d9b8554d): a snippet's object argument naming the listener's own actor reaches its game as 0x14, as
  its self and SerializeArguments' arguments already did. SpSnippet::ClientFormId (SpSnippet.cpp:103-108: 0x14 for the listener's
  own actor at 0xff000000 and up, every other form its own id, any form for no listener) is the one rule: SerializeArguments calls
  it (SpSnippetFunctionGen.cpp:53-56), and MakeMessage, which builds every Execute, Relay and Serve message per listener, applies
  it to the self and now to each object argument (:89-98). The case it fixes: a relationship recorded toward a player (A Lovely
  Letter's Fragment_22, SetRelationshipRank(Game.GetPlayer(), 2), run on the NPC's simulator under that player's acting scope)
  went out with the player's server id as akOther, through MakeLongFormId alone; the player's own seat holds no view of its own
  actor, so Faendal's rank with that player was never applied there, at the relay or at a relog's serve. T0 unit/StandingTest.cpp
  on Arvel (ClientFormId's four cases; the relay to the guest as 0x14; a late seat served the guest's actor id; a relog served
  0x14). No difftest declaration names a receiving client's own actor as an argument, so T2 reads no change.
- T3: x-acting-player v3: claims 22 to 24 read c1's relayed SetRelationshipRank on Faendal (the fallback's line, "snippet
  Actor[.]SetRelationshipRank on 1348c: no view holds its long id 10001348c, run on the game-file reference", at least once, and
  "SpSnippet Actor SetRelationshipRank failed" never), and leg S (S0 to S4, the whole-branch review's SHOULD 4) the server VM's
  actor-self snippet: c1's server console SetAV on Faendal, delegated to c2, his cell's host, whose line names the fallback and
  whose engine's health share moves with the base. The 0x14 argument prints no line of its own (UNVERIFIED end to end, the probe's
  header).
