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

## ADR-062, slice 1: the hosted cell's scripts run (17:12 PST 2026-11-02; slice 1a BUILT on fork m4-scripts-work d8fc5fa2, the gate and the lift; the hooks of decision 2 follow the re-analyst's table)

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

Built in slice 1a (d8fc5fa2): FridaHooks.cpp OnSendEventEnter reads the self's cell for actors as for references, passes a world
object's event in a hosted cell (its lifecycle events anywhere) and a simulated actor's (Hosted and not a puppet) wherever it
stands, consults the layer's host names no more (their lifecycle rule stays for an older papyrus-scripts.txt); objectReferenceEx
lifts the engine's activation on activators and movable statics in a hosted cell (doors, containers, furniture and items keep the
server's flows), HostService walks the cell's references by kind (Cell.getNumRefs, getNthRef) at every grant and release, and
ActivationService sends no Activate for the player's own press on a lifted object. The lab's lever activationUnblockedBases stays
readable until slice 3's scenarios drop their relaunch writes. HYPOTHESIS H1a: Cell.getNumRefs and getNthRef enumerate an exterior
cell's activators on a loaded cell (Papyrus's own, UESP "Cell Script"); H1b: a blocked activator's own press reaches its script
(playtest 41's pillars say yes) and a lifted one's default processing fires its activation parents once per press (the spike wall).

Tests: T0 for each verb's new report path where one is new (the scripted kill's evidence in ActorDeathTest; an NPC's scripted
AddItem recorded in PartOne_ActivateTest's shape); T1 none; T2 difftest's sessions unchanged (the reports are the same messages);
T3 the baseline first (b-object-anim on the union's dist against the morning's 64dbacfe green, the spike wall's regression), then
the Bleak Falls walk by hand on slice 1's stage (the plate and the wall, the pillars and the lever, the spider's drop, Arvel's web
and run, the alcove draugr waking), then q-golden-claw and q-embershard as slice 3's scenarios. Status boxes below stay as they
are until the slice is built; the build opens its fork branch as m4-scripts-work off parity.

## Status

- [x] doc complete, inventory listed with a disposition per row, rung declared
- [x] engine surface cited or delegated (CommonLibSSE-NG ObjectTypeInfo.h, VirtualMachine.h; the fork's Offsets.h)
- [x] server logic + T0: none, no server half (ADR-044)
- [x] message + validator (same commit): no new message
- [x] native hook + T1 (fork m2-train-29 b2db6354, merged to parity 4720d0d3 on 2026-10-20 13:40; T1 is the Windows build's, green)
- [x] TS handler: none
- [x] T2 green: no wire change
- [ ] T3 scenario green, no HYPOTHESIS tags (b-papyrus-events approved by Eli 2026-10-20 and on main, d1d8370, asserting the Creation's check ran connected with the prompt flag from the per-player default; its first run is the layer-merge sweep; x-mcm-register's HUD count still to read)
- [ ] parity scenario green, or its later list reviewed with it (ADR-031): not applicable, no player action
- [ ] sequences and combinations green, every checklist item with its scenario (ADR-033)
- [x] ledger and suppression registry updated (no native; the Suppress section above is the registry entry; NATIVES.md unchanged)
