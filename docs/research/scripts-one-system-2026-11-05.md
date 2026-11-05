# Scripts as one system: the research (2026-11-05)

This file is the research behind ADR-068 (docs/DECISIONS.md): what Skyrim and SKSE do with a script, what the repo has already
decided, what the flip branch and playtests 45 and 46 showed, how the other multiplayer projects did it, and the one model those
readings produce. It is the plan's substance; the ladder that builds it and Eli's answers are in the ADR. Written by thuum-cf on the
night of 2026-11-04 to 05 from six readers and three designs (the Sources line at the end). Canon is fork 7c79fc3e. Every id below
carries the source the reader cited (CommonLibSSE-NG b93280e8 as CL, the fork's files, Ghidra) and its `just addr` result where one
was taken; nothing here comes from memory (rule 1); every inferred side effect is HYPOTHESIS until a trace or a run confirms it
(rule 2).

## The question

Eli, 2026-11-04: "deep dive research the scope of the problem. how does skyrim and skse handle scripts, how can we create a unified
holistic solution so that script events and their associated actions (prop anims, voice lines, actor animations, stuff like hermaus
mora in septimus' outpost, the way vampirism changes stats) can be broadcast and accepted by a client. given how many things are
under the umbrella of scripting, i imagine there's a unified approach rather than making things one at a time." And to numidium:
"if this would be fixed by scripting, fuck it lets go to scripting"; "working from our most up to date cannon ... as much of a
scripting one shot as we can get."

The problem. Skyrim's content is Papyrus: every trap, puzzle, ambush, scene trigger, quest reward, vampire stage and Daedric
apparition is a script attached to a reference, a quest, an alias or a magic effect. The engine runs those scripts on each seat
independently, so in a shared world each seat's scripts would fight the server over state the server owns (ADR-044's reason for the
gate). thuum has answered that one piece at a time: a name list of admitted scripts (ADR-059), a relay per effect
(RelayedActivation, ObjectAnimation, TrapHit, WordWall, QuestStage), a hand-off re-sync for the puzzle pillar (d1f23444). Playtest
41 ("something structural is just not working"), 43 (the scene and the rumor line) and 45 and 46 (the pillars: the whale turn never
seen by any animation hook; a host that inherits a moved graph has a stuck script) are the same lesson: the per-feature shape cannot
finish. ADR-062 (accepted 11-02) flipped the default (the host runs every world script of its hosted cells; the consequences travel
and are ACCEPTED, R2 by default); ADR-063 made ownership the one law and "channels, not features" the test; ADR-065 made the
engine's own saved state the observe point; D-F1 C gave quests no owner. What was missing is the ONE mechanism that carries a
script's consequences (state and actions) from the engine that owns the object to every other seat, and the ONE record that lets a
new owner or a late joiner continue the script where it stands.

The intended outcome. One table (NATIVES.md's rows with a kind, an owner rule, an audience and a record field) and one seam replace
the name lists, the per-feature relays and the special cases; the Golden Claw plays through on two seats (ADR-062 decision 3); a
pillar turned by the host turns on the guest's screen including the whale, and a host that inherits a cell continues its pillars;
the Mora apparition and its lines are seen and heard by both players in the outpost; a vampire's stage change is seen from the other
seat; nothing in the build names a script, a quest or an item except as a test case.

## 1. What is already written (the repo; reader a54d3e20 and the arm's scope reader ac2d442c, 2026-11-04 evening)

The ladder of decisions, each still standing unless amended:
- ADR-008: per-player quest state is the default; an allowlist promotes quests to world-shared (data, not code).
- ADR-029 (10-13): spell scripts run in the caster's game; the server's VM runs only an allowlist of effect scripts; running every
  effect script on the server was ruled out (102 of Apocalypse's 165 natives missing; 93 of 157 live effect scripts call a game-only
  native). A global a player's game writes is that player's (R2); a listed world global is the server's one value (R1).
- ADR-044 (10-19): the client's Papyrus gate admits by class chain and by plugin, never by name; OnUpdate follows the script; "a game
  whose state the server owns must not run scripts that change that state behind the server's back"; vanilla's quests, aliases and
  references stay blanked. Lifting the block wholesale was ruled out THEN (quests "against a server that owns none of their state").
- ADR-056 (10-28): world-shared quest stages: the server's record (R0), the feed R1, applied by Quest.SetStage on every seat
  (idempotent); QF fragments run on every applying seat; objectives, aliases and quest globals NOT synced; D69 B keeps a
  start-game-enabled quest's own start per seat.
- ADR-059 (11-01): the cell's host runs the cell's world scripts; a guest's activation relayed (RelayedActivation 70); the host's
  animation event recorded as lastAnimation (ObjectAnimation 71, R2); TrapHit 72 (R1); decision 5: a scripted object's state as a
  function of its activation count (unbuilt; ADR-059's decision, not ADR-062's). Running vanilla scripts on the server's VM ruled out
  (the VM lacks their natives; the server simulating a cell is forbidden).
- ADR-062 (11-02, accepted by Eli: "shouldn't every script incident be transmitted and accepted? ... trust should LARGELY be the
  default"): the flip. Decision 1: the host runs every world script of its hosted cells, guests run none but the lifecycle events and
  render the relays; decision 2: the consequences travel and are ACCEPTED, the natives that change server-owned state hooked once
  each and routed as the host's report, R2 by default with the wire's bounds the only gate; decision 3: proof by whole dungeons
  (q-golden-claw, q-embershard, green twice). Three slices (1.5 + 2.5 + 1.5 days). The census table (DECISIONS.md:3911-3941)
  classifies every native family by the state it moves and the verb that carries it today.
- ADR-063 (11-02): ownership; decision 2 "channels, not features: once a channel exists, every script, quest and AI routine that goes
  through it works with no new code"; D-S1 A: a non-owner runs a world object's LIFECYCLE handlers (OnInit, OnLoad, OnCellAttach,
  OnCellDetach, OnReset, OnUnload) with their natives filtered at the entry; D-F1 C (11-03): a quest has NO owner: stages, objectives
  and running state are the server's record at R0, a seat's quest native is a request the server records and relays, every seat's VM
  applies it (so a fragment runs on every seat behind the native gates); Game.GetPlayer() gets the acting-player scope; world globals
  and the condition-read variables (TESCondition 629/630) stream from one seat (ADR-066 decision 6's eligible seat).
- ADR-065 (11-03): the save is the state. Decision 5: "the owning seat's VM runs an object's scripts, and a non-owner's VM receives no
  events for it"; at a hand-off the carried script state is {handle, type name, state, flags, positional variables}; stacks, latent
  waits, update registrations and queued functors CANNOT be carried; per-native hooks were ruled out as the PRIMARY channel ("our
  list, incomplete by construction", kept as the cross-check); amendment B globals by a per-frame diff of the TESGlobal array;
  amendment C the condition-read variables by the same diff. STATE.md:131: table:Papyrus is R0 through decision 5's encoder.
- ADR-067 (11-03) decision 7: the container hold, then scripting and quests (the flip, D-F1 C, the acting-player scope, the
  condition-read variables), then physics; playtest 43's scene and rumor failures are scripting's. Quests and scenes are outside the
  flip (no cell).

Engine facts the research files hold (docs/research/adr065-papyrus-state-2026-11-03.md, static, HYPOTHESIS but the slots):
Object::Save 104249 persists {flags, currentState, remainingPropsToInit, variables[]}, positional and parent-first, arrays capped at
128; the whole-VM Papyrus section (SkyrimVM's save body 54041) is not portable per object (per-save string indexes, save-time
addresses), so the per-piece encoder is ours; OnInit's dispatcher is 104875 (it never passes SendEvent); OnCellAttach/Detach,
OnLoad/OnUnload and OnReset do; GlobalVariable.SetValue writes with no AddChange (engine/change-forms.md B4 CONFIRMED).

Machinery that exists: SpSnippet 30 / FinishSpSnippet 10 (the server's delegation of a native to a seat; 33 natives delegated;
PapyrusObjectReference.cpp's idiom sends one snippet per listener of the reference, Execute only to a player-created actor;
HeuristicPolicy picks the executor); Activate 6; ActorSpeech 54; ActorClaim 56; QuestStage 57 (record, relay, login replay, the
fragment of a relayed stage skipped by the 53987 replacement); PlayerGlobals 45; WordWall 69; RelayedActivation 70; ObjectAnimation
71 (lastAnimation, replayed at CreateActor); TrapHit 72; ChangeForm/Ack/Apply 72-74 (the engine's own bytes for an actor). Proposed by
ADR-062 and absent from WIRE.md: RefState, ScriptPlacement, AliasFill, DestructionStage, WorldGlobal.

The verbs: papyrus-events (Play BROKEN since 41), script-variables (unbuilt; the server VM's own scripts' variables), scripted-effects
(Finger of Death re-coded in Rust), quest-stage (Play BROKEN: no Golden Claw), traps (the pillar VERIFIED IN PLAY on the host),
word-wall, activation-reach, npc-talk, npc-stream (the voice chain and the 35225 fragment gate), npc-puppet (scenes HYPOTHESIS,
BROKEN), player-globals, vampirism (design only: R0 condition, R1 feed, R3 sight; "suppress the quest script's own turn, stage and
race swap on every seat"), change-form. NATIVES.md: 109 implemented, 33 delegated, 2 stubs, 18 gamemode, 1,305 missing of 1,467;
the server's VM instantiates scripts only on references from VMADs it has in storage (one .pex shipped); the "Sweet" exterior hack and
two named refusals are marked for deletion. PLAN M6 still says "one scene runner per scene" and warns of a curated scene list.
Upstream's ROADMAP:25: "Variables need to be preserved, needs to be figured out how events work differently from the original
Skyrim". TE-MAP: scenes are never centrally synced in Skyrim Together; TE registers its natives at BindEverythingToScript 55739.
docs/private/scripts-arm-scope.md (191 lines) holds the code map of the scene and voice chain and of the flip, and the latent path's
shape B.

## 2. The flip branch (fork origin/m4-scripts-flip 8896ef0c; the branch reader a7815e76 and the hook reader a58f421f)

The branch: 32 commits over its merge-base 2225c932 with canon; 19 carry the flip (platform: ScriptNatives.cpp/.h, PlatformCall.h,
FridaHooks, FridaHookHandler, VmCall.h, VmCallback.h, Offsets.h; client: objectReferenceEx.ts's lift, activationService.ts,
scriptNativeService.ts, the settle wait in changeFormService.ts; server: ActionListener's cause-3 death report; unit tests). Six are
already in canon; the dying-copy premise commit and its revert cancel out (ChangeForm.cpp nets zero; canon's apply design wins,
byte-identical after a merge). A MERGE onto a branch cut from 7c79fc3e conflicts on two files only: wire-schema lib.rs (take canon's
SCHEMA 35) and changeFormService.ts (a union: canon's queued apply plus the flip's settle wait). Cherry-picking would redo the flip's
own merge resolutions (FridaHookHandler.h's HookID enum, ActorDeathTest.cpp): the merge is the route. CI: a branch named
m4-scripts-flip-canon builds the server image (the m<digit>- rule) and the Windows client.

The hook: the Call hook (NativeFunctionBase::Call, Address Library 104651) routes nothing: it marks the platform's own latent calls so
a latent platform call reads Active() on the VM's thread. Observation is 24 separate entry hooks on the natives' own entry points
(ObjectReference: AddItem, RemoveItem, Enable, EnableNoWait, Disable, DisableNoWait, Delete, PlaceAtMe, PlaceActorAtMe, MoveTo,
SetOpen, Lock, SetLockLevel, Activate, SetDestroyed, DamageObject; Actor: Kill, KillSilent, Resurrect; Quest: SetCurrentStageID,
Start, Stop; GlobalVariable.SetValue; ReferenceAlias.ForceRefTo), raised to JS as scriptNative events; the client only logs them and
marks kills ("Slice 2 turns the rows into reports"). PlayAnimation and PlayAnimationAndWait are NOT among them; the older
HOOK_PLAY_ANIMATION on TESObjectREFR::PlayAnimation_Impl (in canon) feeds the sendAnimationEvent path and never saw the whale turn
either. Nothing on the branch rebuilds a scripted object's state for a guest or a new host beyond the single lastAnimation string
(recorded, sent in CreateActor, replayed, not persisted).

## 3. What playtests 45 and 46 taught (the pillars)

- The guest's view of a scripted object is only as good as the relay: the host never reported the whale turn (Trigger02) in 45, 46
  or the green relay run, with or without the client's success-flag filter: the hook on NotifyAnimationGraph does not see that
  script call at all (HYPOTHESIS: the script's state-2 branch uses the latent PlayAnimationAndWait whose engine path bypasses the
  hooked entry; the native boundary would see it).
- A seat's script state (Papyrus state plus variables) and its graph diverge whenever anyone else drives the graph; a seat that
  inherits a cell with a graph it did not move has a script stuck on its first trigger (PlayAnimationAndWait never returns). The
  script's internal state is the thing to carry, not the graph's events.
- BlockActivation stops no OnActivate; only the platform's Papyrus gate (SetCellHosted) blanks a cell's script events.
- A native in a message handler throws (the platform's gameThrQ is the update's).
- The hand-off fix on the pillar branch (fork d1f23444: the graph reset to the script's side at a grant, the record's side fed as
  activations) is the special case of the general problem in section 6; it waits for the scripting base.

## 4. The engine's and SKSE's surface (reader ad5aed35, 2026-11-04 evening; CL = CommonLibSSE-NG b93280e8, SP = the fork's skyrim-platform/src/platform_se/skyrim_platform on d1f23444; every id checked with `just addr`)

The VM (one object, every script runs inside it):
- BSScript::Internal::VirtualMachine (CL include/RE/V/VirtualMachine.h:40-243, size 0x9518), reached as SkyrimVM::GetSingleton()->impl
  (SkyrimVM+0x200; the fork's port patch 07 adds GetImpl); SkyrimVM's singleton RELOCATION_ID(514315, 400475), `just addr 400475`
  0x20fba70. Bases: IVirtualMachine (+0), IVMObjectBindInterface (+0x10), IVMSaveLoadInterface (+0x18).
- IVirtualMachine slots (CL include/RE/I/IVirtualMachine.h:67-96; SE/AE numbering): BindNativeMethod 0x18 (the fork overwrites this
  slot in Hooks.cpp:457-465 and records every bound native: class, name, IFunction*, callback offset; `Hooks::GetBoundNatives()`, in
  canon), FindBoundObject 0x1C, SetPropertyValue 0x20, GetPropertyValue 0x21, GetVariableValue1/2 0x22/0x23, SendEvent 0x24,
  SendEventAll 0x25, DispatchStaticCall 0x26, DispatchMethodCall1/2 0x27/0x28, IsWaitingOnLatent 0x2A, ReturnFromLatent 0x2B.
- The script instance: BSScript::Object (CL include/RE/O/Object.h:14-54): `type` (ObjectTypeInfo*) +0x08, `currentState`
  (BSFixedString) +0x10, `handle` +0x20, `Variable variables[]` +0x30 (count = the type's total variables + 3). ObjectTypeInfo
  (CL include/RE/O/ObjectTypeInfo.h:16-197) iterates variables, properties, functions and named states by name. Variable is
  {TypeInfo, Value} 0x10 bytes (CL include/RE/V/Variable.h:14-96; patch 02 makes its members public); Array (CL include/RE/A/Array.h).
- Which scripts a reference carries: `attachedScripts` BSTHashMap<VMHandle, BSTSmallSharedArray<AttachedScript>> at VM+0x93A8 under
  `attachedScriptsLock` +0x93A0 (VirtualMachine.h:231-241); the handle from the policy (IObjectHandlePolicy::GetHandleForObject,
  CL include/RE/I/IObjectHandlePolicy.h:20-30; SkyrimScript::HandlePolicy at SkyrimVM+0x328); the fork's SendEvent gate already
  walks this map (FridaHooks.cpp:276-296).
- A call: Stack (CL include/RE/S/Stack.h:24-89: `top` frame +0x60, `stackID` +0x80, `callback` +0x90) and StackFrame (CL
  include/RE/S/StackFrame.h:14-35: `previousFrame` +0x08, `owningFunction` +0x10, `owningObjectType` +0x18, `self` +0x28, `size`
  +0x38, `Variable args[]` +0x40 (patch 03 makes it a real member)). So at the one dispatch, BSScript::NF_util::NativeFunctionBase::Call
  (CL include/RE/N/NativeFunctionBase.h:47, slot 0x0F; RELOCATION_ID(97923, 104651), `just addr` 0x143dc00; the fork's Offsets.h:130
  and the flip's OnNativeCallEnter already attach it), the frame carries the native (IFunction: GetObjectTypeName, GetName), the
  self, the TYPED arguments (Variables, no register conventions, no per-native table of argument slots) and the CALLING SCRIPT
  (owningObjectType's name, the chain through previousFrame). MarshallAndDispatch (slot 0x16) unpacks that same frame
  (NativeFunction.h:53-117). "native supports max 11" (NativeFunctionBase.cpp:15).
- Latent natives (CL include/RE/N/NativeLatentFunction.h:31-110): `_isLatent` +0x42 (the fork reads it, GetNativeFunctionAddr.cpp:18),
  the body returns kStarted and the VM parks the stack (kWaitingOnLatentFunction) until ReturnFromLatent(stackID); the header's own
  warning (:75-76): a stack id not restored across a save blocks the script for good. PlayAnimationAndWait is one of these: the
  pillar's stuck script is exactly a latent wait that never returns.
- Events: SendEvent slot 0x24 (RELOCATION_ID(98077, 104800), `just addr` 0x14477f0; the fork's one script gate, FridaHooks.cpp:231-393,
  a Gum attach reading the handle and the name only; the arguments (Gum arg 3, an IFunctionArguments*, CL
  include/RE/I/IFunctionArguments.h:20: `operator()(BSScrapArray<Variable>&)`) are never read, upstream's known issue #405). The gate
  passes SKI_*, the plugin rows, the host rows in a hosted cell, the lifecycle names, and a few named scripts, else blanks the name.
  GAP: SendEventAll (slot 0x25) has a HookID (SEND_EVENT_ALL) that is never installed: nothing gates it. SkyrimVM::SendAndRelayEvent
  (CL src/RE/S/SkyrimVM.cpp:26-32) sends to the reference then relays to its aliases and magic effects (RelayEvent 54033).
- The two fragment gates (both Gum replacements, AE only): QuestStageSink REL::ID(53987) (FridaHooks.cpp:1586-1777, skips a relayed
  stage's fragment) and SendTopicInfoEvent REL::ID(35225) (:1519-1584, drops a puppet speaker's info fragment).
- The pump: TESModPlatform.Add is dispatched every frame (PapyrusTESModPlatform.cpp:1009-1011) and runs the JS tick inside it with
  g_nativeCallRequirements {vm, stackId} set (main.cpp:119-134); callNative borrows that stack (CallNative.cpp:323-334, :466-473);
  non-latent calls run under `Override` (CallNativeApi.cpp:151), which the SendEvent and animation gates skip; latent calls go
  through DispatchMethodCall2 with a VmCallback (VmCall.h:8-41) and resolve a Promise. The flip's OnNativeCallEnter marks those
  latent platform calls on the VM thread (H-L1 to H-L3 HYPOTHESIS, untraced).
- Save and load: the engine saves the whole VM as one section (IVMSaveLoadInterface SaveGame/LoadGame, CL
  include/RE/I/IVMSaveLoadInterface.h:46-76; Ghidra 104828/104829 in docs/research/adr065-papyrus-state-2026-11-03.md Q3, HYPOTHESIS
  but the slots): the object table, the string tables, the running stacks. A reference's change form does NOT carry its scripts'
  variables. SKSE's SerializationInterface (CL include/SKSE/Interfaces.h:81-182, the co-save with ResolveHandle) is unused by the
  fork. So the per-piece script record is ours to read and write through the VM: attachedScripts[handle] gives each Object, its
  type gives the names, `variables[]` and `currentState` give the values (a direct write; GotoState's begin and end events are not
  run by it: HYPOTHESIS, to trace).
- SKSE beyond the VM: ModCallbackEvent (CL include/SKSE/Events.h:12-20; the fork sinks it already, EventHandler.h:78), the
  Registration helpers, TaskInterface AddTask/AddUITask (the reroll fix's route), MessagingInterface kDataLoaded/kPostLoadGame/kNewGame.
  SendModEvent and RegisterForModEvent live in SKSE's own Papyrus library, not in CommonLib.
- The Address Library: lab/relids.tsv indexes the 17,941 ids CommonLib names (428 functions, 8,814 vtables); the 1.6.1170 database
  holds 428,461; `just addr <id>` is the strict resolver; for anything CommonLib does not name the route is REA then pyghidra-mcp
  (docs/LAB.md:73-103, :1042-1045; the rea MCP failed to connect this session, ghidra's tools are up).
- Defects the reader found: CL src/RE/O/ObjectTypeInfo.cpp:172 builds `REL::Relocation<func_t> func{ 97538 }` as an ADDRESS, not an
  id (ID's constructor is explicit): ~ObjectTypeInfo's ReleaseData is wrong in this CommonLib (never call it); docs/verbs/
  papyrus-events.md:66-67 cites Offsets.h:18-19, now :26-27; docs/research/adr065-papyrus-state-2026-11-03.md cites m4-scripts-work's
  line numbers.

## 5. How others do it (reader a794506f, 2026-11-05; the sources are the projects' own code and docs, cited in the reader's report; the Creation Kit wikis, OpenMW's forum and Nexus were unreachable, so CK text comes from the bellcube and fallout.wiki mirrors)

- TES3MP (OpenMW 0.47): EVERY client runs MWScript locally; the server runs only Lua and relays. Script variables cross by an
  allow-list of scripts (config.lua's "Which clientside scripts should have all of their variables synchronized", with the warning
  "Make sure whatever scripts you add in here don't cause infinite packet spam"), scoped per variable as personal, quest (shared only
  if shareJournal), worldwide or ignored (clientVariableScopes.lua); floats are sent only when their integer part changes; the
  member-short handler is commented out in 0.8.1. Side effects are held on the client until the server approves them (Enable/Disable
  "expect the server's reply to our packet to do it instead", Lock, Unlock, SetDelete, scripted PlaceAt deleted locally and re-sent
  with the server's mpNum); an activation is echoed to the sender only ("OpenMW barely has any code for handling activations not
  from the local player"). Journal, topics, faction ranks and kills are shared by default; "a quest may be completed only once and
  the reward is only given to one player"; "most quests without complex scripting work". Lesson: a variable allow-list is our name
  list in another coat; the per-player versus worldwide scoping is exactly D-Q1; the spam problem is why our owner-side read is
  event-triggered and digest-paced, never per change.
- OpenMW Lua (the post-TES3MP design): "global scripts are server-side and local scripts are client-side"; "a local script can
  only modify the object it is attached to ... the access to [other objects] is read-only"; the MWScript accessors take a player
  argument "used in multiplayer mode to get the script if there is a separate instance for each player". No released multiplayer on
  it. Lesson: the same ownership law (a script writes only what its engine owns), stated as an API rule.
- Skyrim Together Reborn: every client runs the party's quests, scenes and dialogue; only quest starts, stops and stages cross
  (RequestQuestUpdate; the server relays each stage once; the leader's stage holds a member's playing scene); stages applied under a
  ScopedQuestOverride that is thread_local and BROKE because "quest progress is executed on a different thread" (PR #848, Oct 2026):
  the warning for our mark's thread shape (H-A1); broadcast scene lines made receivers' phases race ahead and hang (PR #890, closed):
  the warning against relaying a scene's lines into a receiver that runs the scene itself; aliases never shared ("alias-bound object
  references still aren't transferred", #915): our AliasFill row; PlayAnimation and PlayAnimationAndWait native hooks exist but are
  compiled out (OBJECT_ANIM_SYNC 0); kNonSyncableQuestIds holds the werewolf and vampire transformation quests and the Bleak Falls
  lever scene: the same per-player class D-Q1 names; the play rules ("only the party leader can talk to quest NPCs", "have the party
  leader enter locations first") are the symptoms of every seat simulating. v1.8.4 (2026-10-22) reworked party quest progression.
- NV:MP: no server-side scripting in co-op, no quest sync, "all progress is tied to your save"; locks deliberately unsynced "to
  avoid potential quest breakage". VaultMP: scripts server-side in PAWN or C++, NPCs and quests removed. fnv-coop (a from-scratch
  Rust engine): "the host runs the quest scripts; quest stages, objectives, globals, topics, notes and map markers are the same for
  everyone", with snapshots on join and hash checks that detect and repair drift: the closest cousin of our model (one authority
  runs the script, broadcasts the state, a digest catches drift, which is ADR-065 decision 7).
- The Papyrus VM's public facts (SmkViper, the CK wiki mirrors, SKSE's sources): "scripts are not saved in your save game; script
  variable values and currently running functions are saved so they can be resumed"; a save can land mid-line and the old
  function finishes from the save; property values bake into saves; only one thread at a time runs an instance and any external
  call may unlock it (GoToState before external calls); native calls sync to the frame unless flagged NoWait (SKSE's "set this only
  if your function is thread-safe"); fUpdateBudgetMS and fExtraTaskletBudgetMS bound the VM per frame and "Papyrus never drops
  function calls"; SetCurrentStageID is latent and waits for the stage's fragments; PlayAnimationAndWait "never returns" if the
  event is never hit (the pillar's stuck script, by the book); OnUpdate is not sent in menu mode; mod events go through SKSE's
  QueueEvent and registrations must be refreshed after each load; SKSE's own latent functors share the VM's budget and ResumeStack.
- SkyMP upstream: the server runs .pex in its own VM fed by server-side events; client VM events blanked (the SendEvent hook);
  natives implemented server-side or delegated as SpSnippets with promise returns; "the player" chosen per stack by HeuristicPolicy;
  quests a stub ("GetCurrentStageID - Not implemented"); the roadmap: "needs to be figured out how events work differently from
  the original Skyrim".
- In Fiedler's terms (deterministic lockstep versus state synchronization): TES3MP and ST simulate on every client without
  determinism and reconcile selected state, and their documented failures are the disagreements; fnv-coop and we run the script on
  one owner and replicate state (plus RPC-like delegation for actions). The design in section 6 is the authoritative-owner pattern
  with the engine's own save as the replicated state.

## 6. The unified model (designed by the mechanism agent against sections 1 to 4; the skeptic's findings folded in 6.11)

The working hypothesis held with two corrections and one split: the native boundary is ONE hook but TWO consequence kinds; the
late joiner's view comes from the engine's own saved animation state, not from an action replay; and the acceptance has two halves
(a change form apply for state, a snippet for an action), both "the same bytes the owner's engine made, applied by the receiver's
engine".

### 6.1 The law

A script runs on the engine that owns its object (ADR-063 decision 1 applied to the VM), and a script's consequence crosses exactly
one of two channels:
- STATE: what the engine would save for the object. Observed by the owner's change tracking (ADR-065 decision 2), carried as the
  engine's own serializer bytes (ChangeForm 72, Ack 73, Apply 74), applied by the receiver's LoadGame (ChangeForm.cpp:1364-1402). The
  boundary sees the same call and does two things only: it names the form for the frame's-end serialize, and it counts, so a
  boundary call with no change-form delta in the frame is a lab signal for a missing channel. Why the change form and not the
  call: a state native's effect is often deferred (AddItem, Enable, MoveTo, Delete, DamageObject, Resurrect queue a DelayFunctor
  through SkyrimVM::QueuePostRenderCall, SkyrimVM.h:214) and its arguments say what was asked, not what the engine did.
- ACTION: what the engine never saves (an animation event, a sound, a shader, a notification, a line). Observed ONLY at the boundary;
  the native call itself is the message; the receiver executes the same native under the platform's mark so it is never
  re-captured.
A call on a self this seat does not own is filtered at the boundary and tallied, never reported (D-S1 A's rule, kept). A call this
seat's own platform makes (a snippet, an apply) is the platform's, never a script's.

### 6.2 The seam: one hook on NativeFunctionBase::Call replaces the 24 entry hooks

- The flip's entry hooks read x64 registers after the VM unpacked the frame: each row's layout is a HYPOTHESIS and floats are
  unreadable. One hook earlier, at the VM's dispatch, sees the TYPED frame: BSScript::NF_util::NativeFunctionBase::Call is IFunction's
  slot 0x0F (CL include/RE/N/NativeFunctionBase.h:47; I/IFunction.h:61), RELOCATION_ID(97923, 104651) (CL include/RE/Offsets.h:128-131),
  `just addr 104651` 0x143dc00; the flip already pins it (Offsets::Hooks::NativeFunctionCall) and attaches it.
- The frame: Stack::top is the current StackFrame (S/Stack.h:76); the frame carries previousFrame +0x08, owningFunction +0x10,
  owningObjectType +0x18, self (a Variable) +0x28, size +0x38 and the argument Variables from +0x40 (S/StackFrame.h:21-33; the fork's
  port patch 03 makes args a real member, which CallNative.cpp:466-473 already writes). Arguments are typed Variables read with
  GetType/GetSInt/GetFloat/GetBool/GetString/GetObject (V/Variable.h:62-69); an object argument's form through its handle
  (O/Object.h:19) and IObjectHandlePolicy::GetObjectForHandle (I/IObjectHandlePolicy.h:27). `this` gives GetName, GetObjectTypeName,
  GetParamCount, GetParam(i), GetIsStatic (IFunction.h:47-55) and GetIsLatent (NativeFunctionBase.h:58). The frame chain gives the
  CALLING script and handler: top->previousFrame->owningObjectType->name and ->owningFunction->GetName() (so an action can say "from
  OnCellLoad of defaultPuzzlePillarScript", which the late-join rule uses). MarshallAndDispatch (slot 0x16) unpacks that same frame
  (N/NativeFunction.h:81-92); the fork's direct path fills exactly top->self, size and args before fPtr->Call (CallNative.cpp:331-334,
  :466-473; SkyrimPlatform.cpp:382-392): the strongest static evidence that Call reads from top. Finding 9 of 6.11 refines the read:
  the top frame at Call is the native's own, a stack is pages, and every argument is read through Stack::GetStackFrameVariable.
- What passes through Call: a script's kCALLMETHOD/kCALLPARENT/kCALLSTATIC (CodeTasklet.h:58-60), whether run in the tasklet or
  queued as a FunctionMessage kCall (F/FunctionMessage.h:17-21) and run by VirtualMachine::Update (H-S2); a latent native's START
  with its arguments (the body returns kStarted and the stack parks, N/NativeLatentFunction.h:59-63, Stack.h:32); the platform's own
  direct call (SkyrimPlatform.cpp:382-392 under PlatformCall::Scope) and latent call (VmCall::Run through DispatchMethodCall2, the
  body later inside Call with the Stack's callback the platform's functor: the flip's H-L1 to H-L3); every SpSnippet a client runs.
- What does NOT pass, and is covered elsewhere: the engine's own C++ paths the natives wrap (ActivateRef 19796 from a press or the
  AI, REFR_LOCK::SetLocked 12401, KillImpl 37896 from damage, the console's SetStage 22151, SetOpenState 14287 from a door's
  activation, the Story Manager's starts, the scene system's lines 44673, the behaviour graph's own events): these are STATE marks at
  the AddChange funnel (ADR-065 decision 2) or the engine-level hooks the fork keeps (SendAnimation 38048, PlayAnimation 14297,
  PerformAction 38949, the TESTopicInfoEvent sink, the quest-stage sink 53987, DamageActor 37335). The server's own papyrus-vm is not
  on a seat at all.
- The hook's body, in native, in this order (rule 9): (1) `this` in the table? no: return (the only cost for the thousands of local
  natives); (2) the platform's own? PlatformCall::Active() or Override::IsOverriden(): tally "(platform)" and return, and raise
  PlatformCall's depth for the extent when the Stack's callback is a live VmCallback (the flip's OnNativeCallEnter, unchanged);
  (3) the self (top->self, or the row's subject argument for a static native) and the owner test of 6.6; not owned: tally "(not
  hosted)" and return; (4) the row's kind: LOCAL tally and return; STATE note the form id in a per-frame set the changeFormService's
  pass serializes (changeFormService.ts:222-266 already serializes and compares against the acked FNV) and return; ACTION read the
  arguments by GetParam's types, raise the thread-local "inside a script action" depth for the call's extent (6.7), queue one
  scriptAction event to JS through AddTickTask (the flip's Emit shape) under the budget; (5) leave: lower the depths (the flip's
  EnterCall/LeaveCall with the stack-pointer guard against a throw through Call). The skeptic's findings 3 and 11 (6.11) change two
  things: the hook is a REPLACEMENT that skips a state row's body on a non-owner, and the JS crossing is one batch per frame.
- Cost: Gum's bracket plus one pointer lookup for every native call in the game (the census ran 1,743 calls in 30 s on a seat,
  papyrus-events.md:289, about 60 a second); a row hit adds a GetParentCell read and a set lookup; only ACTION rows of owned selves
  cross to JS, under the flip's 64 a second budget and 30 s census for the rest. The engine's IFunction bytes (pad0C, _userFlags) are
  not written. If a stage ever reads a Papyrus slowdown, a raw Gum listener on 104651 is the fallback the flip named.

### 6.3 The table (docs/NATIVES.md's new hand-maintained columns, preserved by `just ledger` as Rung and Verb are)

kind (state | action | local | everyone), subject (self | arg0 | none), owner (cell host | simulator | player seat | nobody),
audience (subject's listeners | player's own seat | everyone | none), carried as (change form flag | typed verb | ScriptAction |
nothing), relay as (the same native | a non-latent twin plus the arg map | nothing), keep (none | last | log). The table is data:
one Rust const in wire-rules generated from NATIVES.md's columns (the ledger round trip), consulted by the validator and mirrored into
the platform's install-time map keyed by IFunction* (the flip's g_boundFunctions idiom widened to every row). First rows:
- ObjectReference.PlayAnimation / PlayAnimationAndWait: action, self, cell host, self's listeners, ScriptAction, relay as
  PlayAnimation(args[0]), keep log (or none under H-V1).
- Debug.SendAnimationEvent: action, arg0, arg0's owner; a world object as ScriptAction, an actor covered by the stream.
- Actor.PlayIdle / SendAnimationEvent / Say (an actor self): action, simulator, COVERED by the action and animation streams and
  ActorSpeech 54: nothing at the boundary (no double play).
- ObjectReference.Say with a TACT self (DA04's Hermaeus Mora 0x3278d): action, cell host, ScriptAction, relay as Say(topic): the GAP
  of 6.6 until built.
- Scene.Start / Stop: everyone, nobody owns (the actors' simulator plays it, puppets' seats stop it, puppetService.ts:388-402), the
  lines travel as ActorSpeech.
- Sound.Play, EffectShader.Play, ImageSpaceModifier.Apply: action, arg0 (the target), arg0's owner, ScriptAction, the same native.
- Debug.Notification / MessageBox, Game.ShakeCamera, Game.*PlayerControls: local, player seat, nothing.
- ObjectReference.Enable / Disable (and NoWait): state, cell host, change form TESForm.kFlags bit 0 (STATE.md:47, undeclared today:
  declare R2). SetOpen / Lock / SetLockLevel: state, kOpenState bit 23, kLockExtra bit 12 (STATE.md:85, :88). AddItem / RemoveItem:
  state, the self's owner, kInventory bit 5 for NPCs and containers, the inventory verb (R0) for the player. MoveTo / SetPosition /
  SetAngle: state, kMoved and kCellChanged (STATE.md:76, :78), actors and props by their streams. SetDestroyed / DamageObject: state,
  the destruction extra (a row to declare). Actor.Kill / KillSilent / Resurrect: state, simulator, ActorDeath 52 cause 3 (exists).
- Actor.AddSpell / RemoveSpell (self the player): state, player seat, the learned set (R0, the existing AddSpell snippet idiom).
  Actor.SetRace (the player): state, the appearance record's race under the pair rule (vampirism.md:33). ModAV / SetAV (the player):
  state, actor-values' R1 report with the script as cause.
- GlobalVariable.SetValue: state; the per-player list through PlayerGlobals 45; world globals by ADR-065 amendment B's per-frame diff
  from ADR-066 decision 6's eligible seat (no AddChange, STATE.md:110).
- Quest.SetCurrentStageID / Start / Stop: everyone, nobody (D-F1 C), QuestStage 57 as a request with the word u8; applied by the
  engine's own SetStage under the fragment mark. ReferenceAlias.ForceRefTo / Alias.Clear: everyone, the quest record (AliasFill).
- Utility.Wait, RegisterForSingleUpdate, RegisterForModEvent, SendModEvent: local (a mod event's consequences cross at THEIR natives).

### 6.4 The acceptance

- STATE on a non-owner: unchanged from ADR-065 plus the script record: the owner's frame-end serialize (changeFormService.ts:222-266;
  TESModPlatform.SerializeChangeForm, PapyrusTESModPlatform.cpp:1614), the server's record and ack (ActionListener::OnChangeForm
  :4078), the receiver's ApplyChangeForm on the main thread (ChangeForm.cpp:1491). Where the change form cannot carry a state (globals,
  a quest's stages, an alias fill, the player's own records) the existing typed verb carries it; the table's "carried as" says which.
- ACTION on a non-owner: ONE new C2S message, mirrored by ONE existing S2C message. ScriptAction (C2S, reliable, R2): {epoch u32 (the
  subject's owner epoch, ADR-066 decision 3), self u64 (0 for a static native; SpSnippet's long-id convention, SpSnippet.cpp:42-50),
  class String<PAPYRUS_NAME 128>, function String<PAPYRUS_NAME>, args Vec<Option<SnippetArg>, SNIPPET_ARGS 64> (the existing enum Bool,
  Number, String<SNIPPET_STRING>, Object{formId, type}, wire-schema shape.rs:88-98), caller {script, handler}, latent bool}; caps from
  wire-schema lib.rs:187-191. The mirror is SpSnippet 30 (skymp.rs:1181-1195) with snippetIdx 0xFFFFFFFF, one per listener: the exact
  idiom of PapyrusObjectReference.cpp:625-644 (`for listener : GetActorListeners() { SpSnippet(...).Execute(listener,
  kNoReturnResult) }`), run on the receiver by spSnippetService.ts:171-216 as today. (The ladder named the message ScriptCall; see the
  close of 6.11.)
- The server does not understand the action. It validates, Rust first (rule 12): the {class, function} pair is an `action` row of the
  table (E_SCRIPT_ACTION_ROW), the argument count and kinds match the row's signature (E_SCRIPT_ACTION_ARGS), the self is a form of
  the shared load order (E_VAL_RANGE), the sender owns the subject at the epoch (the cells table's host for a world object, the host
  table for an actor, the sender itself for 0x14 selves; E_SCRIPT_ACTION_OWNER; ADR-066's judgments), a per-sender budget (32 then 8
  a second, ObjectAnimation's shape, UNMEASURED). Then it records what the row's keep says, logs one info line a minute per self, and
  mirrors to the audience minus the sender (ActionListener::OnObjectAnimation's loop :3682-3692 generalised). Rule 4: the message,
  check_script_action, two fixtures and the C++ struct in one commit; SCHEMA_VERSION past 35. Why not a typed message per action
  family: a family would need a server rule to earn a type, and an action has none (ADR-063 decision 4); a family that does need a
  rule (a kill, an inventory move, a stage) is a STATE or everyone row carried by its typed verb already. The one typed thing is
  the table.
- The Override and the latent twin: a non-latent snippet runs under Override (CallNativeApi.cpp:150-155) and PlatformCall::Scope; a
  latent snippet through VmCall::Run with its callback noted, and the Call hook raises PlatformCall on the VM thread for its extent.
  The engine-level animation and SendEvent hooks already return early under Override (FridaHooks.cpp:233, :478, :542); they must also
  return early under PlatformCall::Active() so a latent snippet's animation is not reported (a known gap today). A latent native on
  the receiver is never executed in its latent form and no promise dangles: the row's "relay as" names the non-latent twin
  (PlayAnimationAndWait(anim, event) as PlayAnimation(anim), both reach NotifyAnimationGraph; Sound.PlayAndWait as Sound.Play;
  Message.Show as itself with kNoReturnResult). Override is process-wide (Override.cpp:3): H-A1, a genuine script call on a Papyrus
  thread while the worker runs a snippet would be classified as the platform's; a counter settles it, the fix being a thread-aware
  Override, never dropping the mark. (Finding 7 of 6.11 retires Override for one thread-plus-stack mark.)

### 6.5 The record (ADR-065 decision 5's unbuilt half)

- The encoder on the owner, per owned reference, each attached script object as {typeName, currentState, flags, vars[]}: the handle
  by vm->GetObjectHandlePolicy()->GetHandleForObject(form->GetFormType(), form) (I/IObjectHandlePolicy.h:33; HandlePolicy at
  SkyrimVM+0x328, S/SkyrimVM.h:225; CONFIRMED-STATIC); the scripts under attachedScriptsLock from attachedScripts.find(handle)
  (V/VirtualMachine.h:219-220; the fork's walk FridaHooks.cpp:278-290 does this already; CONFIRMED); the type name and chain
  (O/ObjectTypeInfo.h:177-178), the state (O/Object.h:44), the flags constructed/initialized/valid/remainingPropsToInit (:39-42), the
  count type->GetTotalNumVariables() (ObjectTypeInfo.h:150), each variables[i] (Object.h:49, positional, parent-first per
  Object.cpp:84-112: H-R1), its folded type (TypeInfo.h:55), the value (Variable.h:62-69), an object as its handle plus type name, an
  array by _elementType/_size/_data (A/Array.h:73-77) capped at 128 (:69); the names by GetVariableIter (ObjectTypeInfo.h:151) for a
  sanity check only.
- The message ScriptState (both directions, reliable): {formId u32, epoch u32, scripts Vec<{type, state, flags u8, vars Vec<ScriptVar,
  VARS>}, SCRIPTS>}, ScriptVar an enum {None, Int(i32), Float(f32), Bool, Str, Obj{handle u64, type}, Arr{elem u8, items Vec<..,128>}};
  caps SCRIPTS 16 per form and VARS 512 per script (UNMEASURED; a console save's Object::Save census sizes them). The validator: the
  kinds, the caps, a handle's kind in {0, 1, 2}, the owner at the epoch. It lives beside the change form on the server's record (an
  optional scriptState on the form's change form; rule 6's migration and a restart scenario). Beside and not inside because the
  engine's Papyrus section is whole-VM and not portable per object (adr065-papyrus-state Q3): the bytes are ours and the compare is
  ours (an FNV, the changeFormService's acked-hash idiom).
- When the owner reads: at every boundary call naming the self (the cheapest "something changed"; the VM has no variable-changed
  event), at the cell's release, and on the digest cadence (ADR-065 decision 7). A read is taken at a quiet moment of the object:
  no stack of it parked on a latent (H-R2: Object::lockStructure, Object.h:45, with Stack::state == kWaitingOnLatentFunction tells a
  mid-latent object); an object never quiet (a Utility.Wait loop) is read as is, with the loss stated in 6.8. Findings 2 and 6 of
  6.11 sharpen this into the quiescent-point rule and the read trigger (the end of a capturing stack plus a per-frame hash).
- The apply on a new owner or a late joiner, BEFORE that seat's gate opens for the cell (ADR-066's passive-until-applied; today
  hostService.ts:580-591 calls tellPlatform(cell, true) at the grant itself, which must move after the apply and the OwnerAck):
  (1) vm->FindBoundObject(handle, typeName, out) (I/IVirtualMachine.h:81), waiting until `initialized` is set; (2) the count check,
  then each variable through Variable::operator= (Variable.h:40) or the setters (:71-79; SetString re-interns), an object value
  through FindBoundObject of its handle, an array through CreateArray (IVirtualMachine.h:108) then element writes, a property's auto
  variable by PropertyTypeInfo::autoVarIndex (P/PropertyTypeInfo.h:28) or SetPropertyValue (IVirtualMachine.h:85); (3) currentState
  written directly (H-R3: no OnBeginState/OnEndState runs, as the engine's own loader behaves); (4) then the change form apply, then
  OwnerAck, then SetCellHosted(cell, true). Run on the VM's own thread inside a TESModPlatform native (the platform's natives execute
  inside TESModPlatform.Add's Call during the VM's update, PapyrusTESModPlatform.cpp:120-146, :979-1017), as the quest-stage natives
  do; H-R4: race-free while the gate is closed (only lifecycle handlers could run, and they ran at the cell's load). Finding 4 of 6.11
  adds the late joiner's apply window: the record lands when `initialized` flips and before the first non-OnInit event reaches the
  object, OnLoad and OnCellLoad blanked meanwhile and re-sent once after the write.
- How a non-owner's VIEW is derived (where the pillar's node points is the engine's, not the script's): H-V1 (primary): the REFR's
  change form carries kAnimation (bit 28, T/TESObjectREFR.h:157), which the engine's own save restores for a sequence-animated object;
  the on-demand serializer drops that bit today (STATE.md:92): keep it, apply it through LoadGame, and the late joiner's pillar
  stands on the host's side with no replay. Fallback: the server keeps per self an ordered log of the owner's last K ScriptActions (K
  16, UNMEASURED), restarted at every action whose caller.handler is a lifecycle event, served after CreateActor and replayed in order
  under the platform's mark (for the pillar: [StartState0N from OnCellLoad, then its Triggers]); a log longer than K loses the head.
  Either way the host's own script continues from the record's currentState, so d1f23444's graph reset and activation feed
  (objectAnimationService.ts:310-381) retire, and lastAnimation (MpChangeForms, CreateActor's prop, remoteServer.ts:557) retires
  with them.

### 6.6 Ownership of scripts by kind

| the self | owner (whose boundary call counts) | the events (the SendEvent gate) |
| --- | --- | --- |
| a world object (a cell, not an actor, not 0x14, below 0xff000000) | the cell's host: GetParentCell() then Frida::IsCellHosted (g_hostedCells, FridaHooks.cpp:216-224, fed by SetCellHosted at every grant and release) | every event in a hosted cell; lifecycle events everywhere (the flip's hostedWorldScript) |
| an actor | its simulator: Hosted::Is(id) && !Puppets::Is(id) (Hosted.cpp:15-19; hostService.ts:150-162) | the same; a puppet's blanked |
| the player's own (0x14, the player's effects, the player-alias quests) | the player's seat | ADR-044's player rows stay |
| a quest, a scene, an alias, a global | nobody (D-F1 C): an `everyone` row (a request the server records and relays) or `local` | runs on every seat; its consequences hit the gates at THEIR selves |
| a static native | the row's subject argument's owner | n/a |

D-Q1 (Eli's call): D-F1 C's "every quest is the world's unless denied" conflicts with ADR-008's per-player default for
player-condition quests: PlayerVampireQuest 0xeafd5 (its VMAD names the ten race pairs, AbVampire01 to 04b, PlayerIsVampire,
VampireFeedReady) must stay the player's; its stages crossing would turn both players. The recommendation, which Eli took (ADR-068's
Status): a third quest class, `player`, derived from the record (a quest whose only actor alias is the player, or a start-game-enabled
quest the denied list names today; DLC1VCController is a known churn row), overridable by the settings' lists; its stages per player
(today's D62 shape), its script's consequences through the player's own rows. Finding 12 of 6.11 states the derivation.

Eli's examples on the rows. The pillar: the host's PlayAnimationAndWait("Trigger0N") is an ACTION reported whatever the graph's flag
says (the hook reports the CALL, not NotifyAnimationGraph's answer), mirrored as PlayAnimation to the cell's listeners, the side
carried by the script record for a hand-off, the view by H-V1 or the log. Actor animations: covered by the stream (PerformAction
with Hosted::IsPerforming, FridaHooks.cpp:651-691; H-O1 PlayIdle reaches it). Voice lines on an actor: ActorSpeech 54 (the sink
filtered to Hosted::Is, EventHandler.cpp:1367; said on the puppet by sayTopicInfo, voiceService.ts:111-122); nothing added. Hermaeus
Mora: DA04QuestScript runs on every seat (D-F1 C); the summoning stage is a QuestStage request whose fragment runs everywhere; the
Enable of the shunt, the FX and the collision land only on the outpost's host (STATE rows filtered elsewhere) and reach the guests as
the change form's kFlags; the shader (EffectShader.Play on the FX reference) is an ACTION mirrored to the cell; the TACT speaks in the
activating player's own DialogueMenu (BGSTalkingActivator, ChangeFlags kSpeaker, BGSTalkingActivator.h:19), that player's
conversation. THE GAP, named: the voice chain accepts no non-actor speaker (the TESTopicInfoEvent's speaker is a TESObjectREFR,
game/Events.h:104-111, so the engine would deliver a TACT's line, but the sink filters Hosted::Is, a set only actors enter;
ActorSpeech.idx names an actor; VoiceService.ask requires Actor.from; sayTopicInfo calls SayTopic on an AIProcess, which a TACT
lacks): a scene with the abyss as the only speaker would be R3 for the other seat until the row ObjectReference.Say with a TACT self
is built as an ACTION mirrored as the same native (the reference-level say, 19518 in npc-stream.md:1281); H-G1 reads whether the
TACT's line reaches the sink at all. RESOLVED 11-05 at Eli's Mora question: rung 6 of the ladder BUILDS the speaker-owner rule (a
speaker is owned like its kind, an actor by its simulator, a talking activator by its cell's host; a conversation claims the speaker
for the player who opened it; the sink filters by the speaker's owner; ActorSpeech 54 and ActorClaim 56 widened to any reference; the
receiver's reference-level say under the mark), so both players hear Mora: the one in the menu and the one beside. Section 7 below
walks it through. Septimus's ascension scene (SCEN 0x1a333): the actors' host plays it, his lines are ActorSpeech, his dissolve and
death are STATE rows on his simulator. Vampirism: the player's seat runs PlayerVampireQuestScript as its own (D-Q1); SetRace through
the appearance record under the pair table; AddSpell/RemoveSpell the learned set's R0 rows relayed to the figure's seats by the
existing snippet; ModAV the actor-values R1 report; PlayerIsVampire and VampireFeedReady PlayerGlobals; vampirism.md's "suppress the
quest script's own turn on every seat" becomes "the quest runs on its player's seat only", free under the law.

### 6.7 Dedupe and marking

Two observe points can see one script-driven animation on a world object: the boundary (PlayAnimation's Call) and the engine-level
hooks (38048, 14297; FridaHooks.cpp:476-573), since the native's body calls NotifyAnimationGraph synchronously on the same thread.
Decision: script-driven animations of world objects report at the boundary; the engine-level hooks stay for what the engine itself
drives (a door's Open from an activation, a lever's engine-side sequence). The silencing is a thread-local depth, "inside a script
action", raised by the Call hook for an ACTION row's extent and consulted by OnSendAnimationEventEnter and OnPlayAnimationEnter where
they consult Override today (:478, :542). Then objectAnimationService's EVENT_PATTERNS, its self-played marks and the host's report
path retire; ObjectAnimation 71 keeps only the engine-driven family, or retires if the stage shows none (H-D1: on a dungeon stage the
engine-level hook on a non-door, non-actor reference fires only inside a script native's extent). On the whale turn: the HYPOTHESIS
that PlayAnimationAndWait's path bypasses the hooked entry is probably wrong (both natives call the same NotifyAnimationGraph;
traps.md:629-644 found the return flag false while the pillar turned); the boundary makes it moot: the call is the fact. The stream
for actors has no second report to dedupe (the boundary emits nothing for actor animation rows).

### 6.8 What cannot be carried, and the rule at a hand-off

Not carried (ADR-065 decision 5): running and suspended stacks, latent waits (SkyrimVM.h:240-242's wait queues, the animation
callback registry, the quest-stage waits), queued DelayFunctors (:256-263), FunctionMessages in flight. RegisterForUpdate
registrations (SkyrimVM.h:248-249) were on that list; finding 2 of 6.11 corrects it: queuedOnUpdateEvents are plain data and can be
re-issued on the new owner (a rung 3 option, not a promise). The new owner's script starts from its state and variables with no
pending wait; a latent in flight on the old owner finishes there with its late natives filtered "(not hosted)" once the release
lands, or is lost with a crashed owner. Where it bites: PlayAnimationAndWait mid-turn (the last quiet record is one turn behind; the
next press re-syncs; bounded to one action by H-R2); Utility.Wait loops in a world script (the loop restarts only if an event re-arms
it; vanilla's traps and ambushes re-arm at OnCellAttach/OnLoad, which D-S1 A runs on the new owner before the grant: H-R5);
RegisterForSingleUpdate timers on a world script are lost at the hand-off unless re-issued, a quest script's are never handed off.
Acceptable under ADR-062's amendment and ADR-065 decision 5's explicit exclusion; the verb doc says so.

### 6.9 The hypotheses (one observation each)

| id | claim | the observation that settles it |
| --- | --- | --- |
| H-S1 | at Call's entry stack->top holds the native's self and typed arguments for a script's own call | Frida on 104651 beside the 24 entries: each entry hit preceded on its thread by a Call hit whose top->self and top->args[i] equal the entry's registers (16 non-float rows) |
| H-S2 | a native queued as a FunctionMessage still enters through slot 0x0F | the guest's live GlobalVariable.SetValue census row shows a Call hit per entry hit |
| H-L1 to H-L3 | the flip's latent marking (the Stack's callback +0x90 and id +0x80) | the flip's own trace, unchanged |
| H-A1 | the process-wide Override misclassifies concurrent script calls | a counter "(platform by Override on a non-worker thread)" on one stage run; zero means no change |
| H-R1 | variables[] is positional, parent-first, count = GetTotalNumVariables | hook Object::Save 104249 and Variable::Save 104293 under a console save on the host; the count written equals the chain's sum |
| H-R2 | a mid-latent object is readable through lockStructure's Stack state | the same trace on a pillar during its PlayAnimationAndWait: state 3 on the lock's Stack |
| H-R3 | a direct currentState write runs no state events | DispatchMethodCall1 hits named OnBeginState or OnEndState during an apply: zero |
| H-R4 | writing variables inside a native is race-free while the gate is closed | the apply's count of running stacks whose top->self is the object: zero |
| H-R5 | lifecycle handlers plus the record restart vanilla's world scripts on a new owner | b-bleak-traps' plate under a hand-off fires on the new host |
| H-V1 | the REFR change form with kAnimation kept restores a sequence object's side on another seat | c1's turned pillar serialized with bit 28, applied on c2 before the 3D, the node's rotation read by bb559685's export |
| H-O1 | a hosted actor's PlayIdle is carried by the action stream | one UpdateAction per PlayIdle census hit on a hosted NPC |
| H-D1 | no engine-level animation hit on a non-door world object outside a script native's extent | the depth-zero hit counter on a dungeon stage: zero |
| H-G1 | a TACT's dialogue line reaches TESTopicInfoEvent with the TACT as speaker | the sink logs a speaker of form type 0x3D for 0x3278d on the talking seat |

The ladder adds six more, each settled by the probe named: H-P1 (the puzzle lever 0xb7db4 is a FURN the lift does not cover; its
OnActivate under the block still fires the darts; b-bleak-traps on rung 1's stage), H-W1 (the Trigger02 row present at Call where
the old hooks log nothing; x-native-frame v1), H-S3 (the frame read by finding 9's rule: the arguments through 104484 by GetParam's
declared types, the caller previousFrame's owningObjectType, a plain form's id from the handle; x-native-frame v1's args and caller
rows), H-F1 (the result Variable's shape per row's return type for the replacement's skip; the same trace), H-T1 (DA04's summoning
stage relayed and the activator enabled on both seats through the state row; x-mora-scene v1) and H-Q1 (a relayed SetStage runs the
fragment on the receiving seat; standing evidence x-script-natives v7, run 062800, the fragment's skip line on the guest).

### 6.10 What this deletes and what it keeps

Deletes: the 24 entry hooks and their register conventions (ScriptNatives.cpp kNatives, ProbeSelf, ReadFormId, g_byEntry);
lastAnimation (MpChangeForms, CreateActor's prop, remoteServer.ts:557's replay, SetLastAnimation in ActionListener.cpp:3681 and
PapyrusObjectReference.cpp:632); the pillar re-sync and its state (objectAnimationService.ts:310-381, scriptSide, recordEvent,
pillars, PILLAR_*); the self-played marks and EVENT_PATTERNS; activationUnblockedBases and the admitted host rows (gone on the
flip); the per-player quest start (D-F1 C's build order); vampirism.md's suppression of the quest script; the (row, self) latent notes
(gone on the flip). Keeps: the SendEvent gate and SetCellHosted (the one event decision point); the lifecycle exception (structural
for OnInit, adr065 Q4); the flip's Call hook, PlatformCall and the live-callback set; Override (kept by the mechanism design, retired
by finding 7 of 6.11 for the one thread-plus-stack mark); the bound-natives recorder (Hooks.cpp:457-522); SpSnippet and
FinishSpSnippet; ChangeForm 72 to 74 and their apply; QuestStage 57 with the fragment gate 53987; ActorSpeech 54 and the puppet say;
the two Gum replacements; RelayedActivation 70 and TrapHit 72; the PerformAction stream; the census and its budget; the Survival and
word-wall player rows; kNeverAdmitted.

### 6.11 The skeptic's findings and the rules they add (folded; each is a rule inside the model, none a per-script case)

1. ORDER (the most likely lab cost). Reliable sends share renet's ReliableOrdered channel 0 (WIRE.md:116-122), but the server's
   snippets go through PartOne's DEFERRED queue (SpSnippet.cpp:57-58 "channel 1" is PartOne's queue index, flushed at the tick
   after every immediate send, PartOne.cpp:1080-1121, :1566-1592) while ObjectAnimation and ChangeFormApply relay at once; and the
   client applies a change form asynchronously on the UI task (changeFormService.ts:439-443, :503-523) while a relay plays at the
   next update. So a record and an action for one object can land in either order. Rule: one per-object SEQUENCE owned by the
   server (beside ADR-066's epoch, which fences authority, not order); every record served and every action relayed for the object
   carries it; relays never go through the deferred queue; the receiver applies in sequence per object, holds an action past its
   applied record, drops one at or below it; a late joiner gets the object's record and its last action as one message. Proof: ten
   host turns in a burst, the guest's node rotation equals the host's; the per-object sequence monotonic in both logs.
2. THE RECORD MID-WAIT. A script parked in PlayAnimationAndWait has its busy variable SET, so a record read then carries a stuck
   script by its variables alone (46's "busy for good"), no stack involved. Rule: a record is read only at a quiescent point of its
   object (no running or waiting stack whose self is the object: allRunningStacks and waitingLatentReturns under runningStacksLock,
   VirtualMachine.h:210-212, or the object's lock holder, Object.h:45); else the last quiescent record stands and the in-flight stack
   is abandoned at the hand-off, its effect carried by the ACTION already relayed. Every latent row names its non-latent twin for
   relays (PlayAnimationAndWait to PlayAnimation, Enable to EnableNoWait, Disable to DisableNoWait); a row with no twin (Utility.Wait,
   MoveTo's load wait) is never relayed. On a non-owner a blocked latent returns the kFailed shape (NativeLatentFunction.h:59-63), so
   no guest stack ever hangs. ADR-065's "update registrations cannot be carried" is too strong: queuedOnUpdateEvents are plain data
   {updateType, timeToSendEvent, updateTime, handle} (SkyrimVM.h:143-158, :246-249) and can be re-issued on the new owner, one
   RegisterForSingleUpdate per entry under the platform's mark (a rung 3 option, not a promise).
3. THE FILTER MUST SKIP THE BODY. Today's "(not hosted)" is a report filter: a Gum attach cannot skip the body, so a guest's
   lifecycle handler still PERFORMS RemoveItem 48, MoveTo 16, PlaceAtMe 8, Disable 7, Lock 1 within 90 s of arrival (DECISIONS.md:
   4021-4025) and the guest's world diverges, overwriting a record applied at init. Rule: the hook on 104651 is a REPLACEMENT (the
   HookHandler::Replace shape of 53987 and 35225), not an attach: a state row on a seat that does not own the self skips the body
   and returns kCompleted with the row's None or false in the result; latent rows return kFailed; action rows run (a pillar's
   StartState0N jump is wanted everywhere). Rows that are both (Activate, SetOpen, Lock on an open door) are STATE; the non-owner's
   visual comes from the record applied through the engine, which snaps: a declared limit. HYPOTHESIS H-F1: the result Variable's
   shape per row's return type; the trace on x-native-frame reads it.
4. THE APPLY WINDOW ON A LATE JOINER. OnInit is VM-internal (104875; the stack-finished path 104854 sets `initialized`) and OnLoad and
   OnCellLoad pass the gate everywhere, and defaultPuzzlePillarScript jumps its graph at OnCellLoad from its own state, so a record
   applied after OnCellLoad leaves the graph on the initial side and one applied before `initialized` is stomped by OnInit. Every
   seat starts from the platform's template save (LoadGame.cpp:14, :91-121; remoteServer.ts:884-915), so every VM begins from one
   Papyrus section and the server's record is the only divergence. Rule: the record is applied when `initialized` flips and before
   the first non-OnInit event reaches the object: the SendEvent gate BLANKS OnLoad and OnCellLoad for an object whose record is
   pending and the apply re-sends them once through SendScriptEvent (rung 3's native) after the write; the guest's own handler then
   renders FROM the record by the script's own code, which is the whole worth of D-S1's exception.
5. THE ACTING PLAYER'S TWO MISSES. A VMAD `Actor Property PlayerRef Auto` and the opcode compare `akActionRef == Game.GetPlayer()`
   (CompareVariables 105220, TE-MAP.md) never touch a native; and a stage set by a timer, an OnUpdate, an alias's OnDeath or the Story
   Manager has nobody acting, so D-F1 C's fragment on every seat rewards every seat's player (H1 doubled by seat count). Rule: every
   relayed request (a stage, an activation, a scene start) carries an acting player, the reporter's own by default and the first
   reporter's for a request with no interaction; within the scope, at 104651, every self or argument Object resolving to 0x14 is
   replaced by the acting figure's bound Object (FindBoundObject on the figure's handle) before MarshallAndDispatch, and
   Game.GetPlayer's result on return; a seat whose scope names another player's figure lands no player-targeted consequence on its
   own player (the figure is not its own: the state row filters). The PlayerRef-property and equality shapes stay a DECLARED MISS,
   sized by a census read (scripts naming GetPlayer against scripts with a PlayerRef property) before rung 5.
6. GOTOSTATE AND ASSIGNMENT NEVER CROSS THE SEAM. GotoState is VM-internal (the linker alone references it; HYPOTHESIS by Ghidra)
   and kASSIGN runs inside the tasklet, so the record cannot be derived from captured calls. Rule: the record's read trigger is the
   END of any stack that made a captured call on the object (the Call hook's leave sees the stack id) plus a per-frame hash of each
   hosted object's variables (0x10 bytes each) against the last reported; a changed hash at a quiescent point sends the record.
7. OVERRIDE IS A PROCESS-WIDE BOOL (Override.cpp:3, set on the JS thread, the native running on the worker) and every gate trusts
   it: a guest's OnActivate dispatched inside a window passes unblanked; a host's own animation event inside one is never reported;
   the latent branch sets no Override at all. Rule: ONE mark, thread-plus-stack (PlatformCall's thread-local depth raised by the
   Call hook for a platform-dispatched stack), consulted by the SendEvent gate, the animation hooks and the natives' hooks; Override
   retires (6.4's H-A1 is answered by construction).
8. ONE OBSERVE POINT PER ROW. A script's PlayAnimation is seen at the boundary and at 38048 or 14297; a stage's reward can land from
   the host's fragment and from a server grant. Rule: STATE.md's observe column names exactly one point per row (the boundary for
   actions with no change flag, AddChange for state, the engine's sinks for dialogue and scene phases); the Call hook's thread-local
   depth makes the engine-level hooks drop what the boundary owns; on the server every relayed consequence carries its cause key
   (the object's sequence, or the quest and stage pair) and the record folds a repeated key, so no server-side grant exists beside
   a fragment. The platform's own AddItem and RemoveItem bypass the native (CallNative.cpp's IsAddItem branches): inventory is never
   relayed as an action; it is the inventory verb's R0 row.
9. READING THE FRAME. The top frame at Call is the NATIVE's own (owningFunction the native, owningObjectType its class; the platform
   builds it so, CallNative.cpp); the calling script is previousFrame's owningObjectType; a stack is PAGES (Stack.h:54-62) and
   MarshallAndDispatch reads every argument through Stack::GetStackFrameVariable (Stack.h:67; RELOCATION_ID(97746, 104484), `just
   addr` 0x1432850), never by pointer arithmetic. Rule: arguments are read through 104484 with GetParam's declared types; count at
   most 11; a row whose parameters include an array is not relayable (SnippetArg carries bool, number, string, object); a plain
   form's id is the handle's low 32 bits with mid 0xFFFF (HYPOTHESIS encoding, adr065 Q1).
10. SCENES PASS NO NATIVE AND MARK NO FLAG. A scene's phases are the engine's (BGSScene's only flag is kActive); a guest hears lines
    with no phase context (43's B2). Rule: scenes get the engine sink (TESScenePhaseEvent, SkyrimVM.h:121) as their observe point,
    relayed as actions keyed by the quest's sequence; the voice chain keys on the speaker's OWNER (the cell host for a non-actor, the
    simulator for an actor) and the receiver plays a non-actor's line through the reference-level path (19518) under the mark.
11. COST. The flip's hot path takes a mutex, builds strings and allocates a tick task per live call; the 64 a second budget drops
    the 65th Enable with a tally and no log. Rule: fixed-index atomic counters (row times kind), no lock and no allocation on the hot
    path; ONE JS crossing per frame carrying the frame's captured calls as an array; no drop for a state row (the cap applies to
    census rows only); the whole-game rate at 104651 measured on both seats (Riverwood at 8:00 for 120 s and a Bleak Falls fight)
    before the first stage.
12. QUEST SCOPE AS A DERIVATION. Rule (D-Q1 refined): a quest is per player when every alias it fills is the player or lives in the
    player's inventory (esm.py over every QUST's aliases), measured against today's allowed and denied lists before it replaces them;
    the lists stay until the derivation matches.
13. SECURITY: THE SHAPE IS THE GATE. Rule: the validator checks (class, function) against the table shipped in wire-rules (kind
    action, relayable, parameter types, self kind); the self is a game-file id inside the load order's ranges or a server id the
    sender owns, never a player's figure from a client (the server names players); every parameter typed, strings bounded, arrays
    absent by construction, count at most 11; a per-sender per-row budget; state rows never travel as actions. The VALUE is never
    judged (ADR-062's amendment).
14. MODS. Natives of modules outside the game have no row (local, nothing crosses); SKSE mod events reach scripts through
    vm->SendEvent (RegistrationSet.h:84-93), so the gate sees them, and their registrations live in SKSE's co-save; a script whose
    state lives outside the VM (StorageUtil, JContainers) restarts from nothing at a hand-off: a declared limit named by the census,
    not an exception.
15. SENDEVENTALL (104801, `just addr` 0x1447b40) has only vtable xrefs; the one decompiled broadcast uses slot 0x24. Rule: install the
    same gate on 104801 regardless (one more attach, the same key); a Frida count beside it for one two-seat hour.
16. SMALLER. Fork code reads ObjectTypeInfo through raw pointers under the VM's locks and never holds its smart pointer (the
    ReleaseData defect); SEH is unnecessary at Call (the VM's own smart pointer holds the frame); nextStackID is a counter, so the
    platform's stack-id test is sound; Hosted and Puppets lag the grant word by one update (hostService.ts:150-162, :174-185), so a
    relay in that window is blanked and lost: ADR-066's ack is sent AFTER SetCellHosted and the server relays nothing to a
    NotYetActive owner.
17. THE WHALE AS FIRST PROOF, disputed. The skeptic reads traps.md:629-644 as the hook HAVING noted Trigger02 with the flag false;
    numidium's read of 46 on 83a40da3 (the flag condition live) counts zero Trigger02 reports among seven turns. Resolution: the
    whale stays rung 2's first READ, not its gate: x-native-frame decides whether 104651 sees the PlayAnimationAndWait("Trigger02")
    call the graph hook never reported (the seam proven necessary), or neither sees it (the script's own branch, a different
    finding); the model's first two-seat PROOF is the hand-off with a record (rung 3) and the late joiner.

Decided from the two designs, not asked: D-A1 the action relay is one opaque message plus the Rust table (not a typed message per
family); D-A2 the Call hook is a replacement with a per-frame batch (findings 3 and 11); D-A3 the per-object sequence (finding 1) is
built in rung 2 with the message and served with the record in rung 3. The ladder named the message ScriptCall (not ScriptAction)
because it carries EVERY tabled call of an owned self: an action row is mirrored as a snippet; a state row gives the server its typed
view and triggers the owner's change-form serialize; an everyone row is the request path; a local row is never sent. One message,
one validator, one table. Sections 6.3 and 6.4 keep the design's name where it was written.

## 7. The two named examples in the game files (read 2026-11-05 00:4xZ on sky-srv's Skyrim.esm with lab/esm.py)

Hermaeus Mora at the outpost: quest DA04 "Discerning the Transmundane" 0x2d512 (VMAD 2854 B: DA04QuestScript, DA04SeptimusScript,
DA04OghmaInfiniumScript, the aliases Alias_HermaeusMora, Alias_Septimus, Alias_OghmaInfinium and more, fragments 0 to 167, the stage
scenes DA04SeptimusReadsScroll 0x3499e and DA04SeptimusAscension 0x1a333); the apparition is the TALKING ACTIVATOR DA04HermaeusMora
(TACT 0x3278d, an invisible-collision model) placed as 0x3278e at (-769, -843, 164) in SeptimusSignusOutpost (CELL 0x2d4e4), with two
DA04HermaeusMoraActivatorShunt ACTIs (0xf5b00, 0xf5b04); the TACT and the shunts carry no VMAD: the quest's fragments and the alias
drive them (Enable, the scene's lines through the TACT as speaker). So the example is exactly: a quest with no owner (D-F1 C) whose
fragment ENABLES a reference (a state) in a hosted cell and starts a scene whose SPEAKER is not an actor (the speaker-owner rule: a
talking activator is owned like the cell it stands in).

The Mora walk-through, the model applied step by step (the session's answer to Eli's Mora question; built by rung 6, read by
x-mora-scene v1 and v2):
1. The quest has no owner. DA04QuestScript runs on every seat (D-F1 C). The summoning stage is a QuestStage 57 request with the word
   u8: the seat whose player reaches it reports, the server records it on the world journal and relays it, every seat's engine applies
   it through its own SetStage under the fragment mark, and the fragment runs on every seat behind the native gates with the
   reporter as the acting player (finding 5).
2. The abyss is state. The fragment's Enable of the TACT 0x3278e and the shunts, the FX and the collision are STATE rows whose self
   lives in SeptimusSignusOutpost: on the outpost's host the Enable runs and the engine marks kFlags bit 0 (STATE.md:47); on every
   other seat the replacement skips the body (finding 3), and the guests get the host's bytes as ChangeForm 72 to 74 applied by
   LoadGame. The shader on the FX reference (EffectShader.Play) is an ACTION mirrored to the cell's listeners as the same native under
   the mark. H-T1 reads the stage on both seats and the activator enabled on the guest.
3. The lines cross by the speaker-owner rule and the claim. The TACT is a speaker owned like its kind, by the outpost's host. The
   player who activates it opens the conversation in its own DialogueMenu (BGSTalkingActivator, ChangeFlags kSpeaker,
   BGSTalkingActivator.h:19) and that conversation claims the speaker for that player (ActorClaim 56 widened to any reference). The
   topic-info sink on the talking seat filters by the speaker's owner instead of Hosted::Is (EventHandler.cpp:1359-1369; H-G1 reads
   that the line reaches it with a speaker of form type 0x3D for 0x3278d), the line crosses as ActorSpeech 54 (idx widened to any
   reference), and the other seat plays it through the reference-level say (19518, npc-stream.md:1281) under the mark, because a
   TACT has no AIProcess for sayTopicInfo. Both players hear Mora: the one in the menu and the one beside.
4. The ascension scene plays on the actors' host. DA04SeptimusAscension 0x1a333 passes no native and marks no flag (finding 10): its
   observe point is the engine's scene sink (TESScenePhaseEvent, SkyrimVM.h:121), its phases relayed as actions keyed by the quest's
   sequence; Septimus's simulator plays it, his lines are ActorSpeech 54, his dissolve and death are STATE rows on his simulator (the
   kill as ActorDeath 52 cause 3, the rest as his change form).
5. The reward is alias-created. Alias_OghmaInfinium fills by ReferenceAlias.ForceRefTo, an everyone row recorded on the quest's record
   as AliasFill (rung 4): the created item's base is added once to the filled container's record, every seat's alias fill names the
   same book, and the player's take is the inventory verb's R0 row, never a second copy per seat.
6. The quest is shared by the derivation. DA04's aliases name Hermaeus Mora, Septimus and the Oghma Infinium, not only the player or
   the player's inventory, so D-Q1's rule (finding 12) makes it the world's: one journal, both players; a per-player quest is one whose
   every alias is the player or lives in the player's inventory.

Vampirism: PlayerVampireQuestScript (the census rows: AddSpell, RemoveSpell, EquipSpell, RemovePerk, SetRace, RestoreActorValue,
SendAssaultAlarm, SetAttackActorOnSight, RemoveFromFaction, EnablePlayerControls, DisablePlayerControls, IncrementStat, Play): a
per-player quest's script on the player's own seat (PlayerVampireQuest 0xeafd5: its only actor alias is the player, so D-Q1's
derivation keeps it the player's, and its VMAD names the ten race pairs, AbVampire01 to 04b, PlayerIsVampire and VampireFeedReady).
Its consequences on the player are state the player's own verbs already carry (the known set through the learned set's R0 rows and
the existing AddSpell snippet, perks, race through the appearance record under the pair rule, actor values through the R1 report with
the script as cause, the two globals through PlayerGlobals 45) and local actions (the controls, a sound: local rows). docs/verbs/
vampirism.md's design (R0 condition, R1 feed, R3 sight) is this model applied, with the race permit's rule the one addition (a race's
vampire twin permitted by the player's vampirism record); its "suppress the quest script's own turn on every seat" becomes "the quest
runs on its player's seat only". x-vampire-stage v1 reads it: stage 10 by console on c1, the stage recorded per player, c1's
abilities in c1's record, c2's own race unchanged, c1's figure's race on c2 recorded.

## Sources

Six readers and three designs, 2026-11-04 evening to 2026-11-05 01:0xZ: the repo's decisions and verbs (a54d3e20) with the arm's
scope (ac2d442c); the flip branch against canon (a7815e76); the flip's native hook (a58f421f); the engine's and SKSE's surface through
CommonLibSSE-NG b93280e8 and the fork's hooks on d1f23444 (ad5aed35); TES3MP, OpenMW, Skyrim Together, NV:MP, VaultMP, fnv-coop and
the Papyrus VM's public write-ups (a794506f); and the mechanism, ladder and skeptic designs (three Plan agents). Nothing was edited
and no branch was cut during the research; the decisions are ADR-068's. Dated 2026-11-05.

## 8. Reads after approval (2026-11-05, read-only, the game files on sky-srv; CONFIRMED from the bytes unless tagged)

The acting player in the two first dungeons. Over the 14,302 vanilla scripts the census reads, 2,599 string tables name
GetPlayer, 82 name PlayerRef, 40 both. On the world objects of BleakFallsBarrow01 0x371de, BleakFallsBarrow02 0x371dd and
EmbershardMine01 0xb6be6 (each REFR's and its base's VMAD), 54 distinct scripts: 27 name GetPlayer, NONE names PlayerRef. Among
them defaultPillarPuzzleLever, TrapTriggerBase ("playerOnlyTrigger"), TrapHitBase, masterAmbushScript, defaultActivateSelf
("playerOnly"), HallofStoriesKeyholeScript ("allowNonPlayerActivation"), HallofStoriesDiskScript, PhysicsTrapHit and MS13's stage
triggers. So in these dungeons a script tests the player only through Game.GetPlayer(): the acting-player scope's swap of that
native's result covers both the call and the compare `akActionRef == Game.GetPlayer()` (the compare's right side is the swapped
figure). The PlayerRef-property miss of 6.11 item 5 is absent here and small elsewhere (82 scripts, 40 of which also call
GetPlayer).

DA04's apparition. QUST 0x2d512 (overridden by Dawnguard, Dragonborn and USSEP; all four bind the same 13 fragments): stage 40's
fragment (Fragment_6) completes objectives 30 and 35, shows 41 to 45, gives the player the Extractor and the BloodHarvest perk
(Game.GetPlayer().AddItem, AddPerk) and calls DA04QuestScript.EnableHM(True), which plays PlayAnim02 on HermaeusMoraFX 0xf5afe and
Enables HermaeusMoraActivator 0xf5b00, HermaeusMoraTA 0x3278e and HermaeusMoraCollision 0xf5b01 (each placed initially disabled,
record flags 0x40000c00); stage 60 MoveHM() (the Alt refs 0xf5b05, 0xf5b04, 0xf5b03 and a MoveTo to 0x15b73) then EnableHM(True);
stage 200 EnableHM(False); two dialogue fragments (TIF 0x3277b, 0x32784, DefiedHermaeusMora) disable it too. Under Dragonborn the
TA carries DLC2DA04PropertiesScript and EnableHM switches its face FX by ChangeState instead of the animation. The shunts carry
DA04HMActivatorShuntScript: OnActivate passes the activation on only when `akActivator == Game.GetPlayer()` (the acting-player
gate again). DA04SeptimusAscension 0x1a333 starts from INFO 0x1a304's fragment (GetStage DA04 == 50 and the speaker Septimus); its
phases complete on GetVMQuestVariable (TESCondition 629) of SeptimusStartAscension_var and BoxOpened_var, the condition-read
variables of rung 5; the Disappear spell 0x106e1e's effect script calls Kill on Septimus (a script kill, ActorDeath cause 3); the
end fragment sets stage 55 or 105. DA04SeptimusReadsScroll 0x3499e is referenced by no record in any of the four files (nothing
starts it). So x-mora-scene's stage is 40, and every piece of it falls on a ladder row: the stage (rung 5's request), the three
Enables (state rows on the outpost's host, rung 4's RefState), PlayAnim02 (an action row, rung 2), the player's AddItem and
AddPerk (the acting-player scope, rung 5), the TACT's lines (rung 6's speaker-owner rule), the scene's phase variables (rung 5's
stream), Septimus's death (cause 3).

The per-player quest rule, measured as Eli's answer asks (every alias the player, ALFR 0x14 or ALUA 0x7, or created In the player's
inventory). Start-game-enabled quests marked per player: Skyrim.esm none of 330 (143 have no alias; 187 have a world alias; the 19
with a Player alias all have unique-actor or forced-ref aliases too); Dragonborn DLC2DialogueRavenRock; Survival's main quest
SurvivalModeMainQuest; two mods' controllers. Not start-game-enabled but per player by aliases: the Survival need quests and
Survival_PlayerInfoQuest, PlayerWerewolfQuest 0x2ba16, Dawnguard's DLC1PlayerVampireQuest 0x71d0. Against today's lists (44 denied,
4 allowed): none of the 48 is in the derived set; they are world quests by their aliases. PlayerVampireQuest 0xeafd5 has NO alias,
so the strict rule leaves it unmarked, and the vacuous reading ("no alias is every alias") would mark 143 Skyrim.esm quests,
dialogue hubs among them. Result: the rule does not yet separate the cases, so by Eli's answer the lists stay. A refinement for
rung 5 to measure the same way: a quest is the player's when every alias it fills is the player's AND (it has an alias, or every
reference its script's natives target is the player's own, read from the census by script); DLC1VCController 0x201a428 (four
forced-ref door aliases) stays world as it should.
