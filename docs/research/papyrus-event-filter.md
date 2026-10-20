# The client's Papyrus event filter: Apocalypse's MCM, Survival Mode and the mod layer (memo, 2026-10-19)

Read-only analysis for train-29. Fork read at origin/m2-train-28; CommonLibSSE-NG at the pinned
checkout; SkyUI 6.11, MCM Helper 1.6.2 and the mods' scripts read from lab/.cache/mods (their pex
parsed in memory with lab/pex.py, no files written). Every inference is tagged HYPOTHESIS.

## 0. Verdict

The lead's cause holds, with two corrections. (1) Skyrim Platform's SendEvent hook already admits
SkyUI by the prefix `SKI_`, but it reads only the LEAF class name of each script attached to the
handle (FridaHooks.cpp:94-102), so `WB_MCMQuest_Script extends SKI_ConfigBase` fails the test while
SkyUI's own `SKI_ConfigMenu` passes. (2) The swallowed events are not OnConfigInit, OnGameReload or
OnPageReset, which SkyUI calls directly in Papyrus; they are `OnInit` on the config quest's handle and
the SKSE mod-event callback `OnConfigManagerReady`, the one call that registers a menu
(SKI_ConfigBase.psc:497-516). The fix is a parent-chain walk at the same spot, about ten lines.

## 1. What is hooked, how, and what the list compares

- Hook point. `InstallSendEventHook` (FridaHooks.cpp:161-166) installs a Frida Gum interceptor at
  `Offsets::Hooks::SendEvent.address()`; game/Offsets.h:18-19 defines it as
  `inline REL::Relocation<std::uintptr_t> SendEvent{ RELOCATION_ID(98077, 104800) };`
  (Address Library ids, SE and AE; no signature scan). The function is
  `BSScript::Internal::VirtualMachine::SendEvent(VMHandle, const BSFixedString&, IFunctionArguments*)`,
  IVirtualMachine's virtual at slot 0x24 (CommonLibSSE-NG include/RE/I/IVirtualMachine.h:89, override
  include/RE/V/VirtualMachine.h:119); the hook's own comment names that signature (FridaHooks.cpp:27)
  and reads argument 1 as the handle and 2 as the event name (:33-34).
- Enter handler, in order (`OnSendEventEnter`, FridaHooks.cpp:28-151):
  - :30-32 returns early under `Override::IsOverriden()` (Override.h:14, an SP-internal bypass).
  - :36-50 resolves `selfId` through `vm->GetObjectHandlePolicy()` (actor, then reference).
  - :52-53 `EventsApi::SendPapyrusEventEnter(selfId, eventName)`: the JS hook sees EVERY event here,
    before any block (EventsApi.cpp:100-104; Hook.cpp:40-58; Handler::Matches by minSelfId, maxSelfId
    and pattern, Handler.cpp:20-32; HookPattern.cpp:6-28).
  - :55 `blockEvents = TESModPlatform::GetPapyrusEventsBlocked()` (PapyrusTESModPlatform.cpp:994-997),
    a flag `BlockPapyrusEvents` sets (:856-860) and skymp5-client sets once at its first tick and
    first update (blockPapyrusEventsService.ts:6-17; the JS alias DevApi.cpp:185-188, DevApi.h:68-70).
  - :73-83 the ActiveEffect exemption: an effect the player bears or cast passes (ADR-031's halves).
  - :85 `if (blockEvents && strcmp(*eventName, "OnUpdate") != 0 && vm)`: the allow list below is
  consulted for every event but OnUpdate. Since the blank at :147-150 applies whenever `blockEvents`
  is still set, an OnUpdate under the block is blanked for EVERY script, admitted names included: it
  is the one event the list never clears (the lead's read of the brace structure, 2026-10-19 evening,
  which corrects this memo's first draft and the two older docs quoted below; the lab's unblock probe
  and a HUD trace for SkyUI's own OnUpdate line are the measurements). This is the only place the
  EVENT NAME matters.
  - :86-89 takes `vm->attachedScriptsLock`, finds the handle in `vm->attachedScripts`.
  - :92-141 loops over the scripts attached to the handle and reads, per script,
    `info = script->GetTypeInfo(); name = info->GetName();` (:94-95): the script object's own class
    name. Admits on: `SKI_` prefix, four chars, case-sensitive (:97-102); `RaceMenu` prefix, case-
    insensitive (:103-113); exact `GRIM_ALT_TeleportationMarker` (:114-123); exact
    `WB_DestroyAfterDelay_Script` (:124-135); exact `defaultDisableHavokOnLoad` (:136-139). A hit
    clears `blockEvents` and breaks.
  - :147-150 blanks the event by replacing argument 2 with an empty FixedString, so the VM finds no
    handler to run (HYPOTHESIS on the VM's side; the observed effect is every verb doc's "blanked").
- So the list compares against the leaf class name of each attached script object
  (`ObjectTypeInfo::name`, include/RE/O/ObjectTypeInfo.h:177), never the event name (except that OnUpdate skips the list and stays blanked),
  never the form's name, never the parent chain. The list lives in code, FridaHooks.cpp:97-140; no
  JSON, no setting, no native to extend it.
- Scope. Everything that enters through slot 0x24 while the flag is set. Not covered: `SendEventAll`
  (slot 0x25, VirtualMachine.h:120), `DispatchMethodCall` (IVirtualMachine.h:93), and Papyrus-to-
  Papyrus calls, which the VM runs as `callmethod` instructions inside its tasklets (HYPOTHESIS: they
  never pass this entry; consistent with the fork's experience that admitting SkyUI's and RaceMenu's
  handles was enough for their menus).
- History and why. Upstream 431c1a49 (2021-04-20, "[FIX] Allow SkyUI events (#91)") added the SKI_
  loop verbatim onto an older total blank; the fork added GRIM_ALT (d1fb786c, 2026-10-12), the
  ActiveEffect halves (2fe894e1, 320cfda8) and WB_DestroyAfterDelay_Script (abe87806, 2026-10-19:
  Lightning Strike's bolt activator hung in the sky of the game that placed it; "R3, visual, in every
  game", FridaHooks.cpp:125-133). The filter exists because the server owns state: quests are per-
  player by default and world-shared by allowlist (ADR-008, DECISIONS.md:91-97); "each client's game
  blanks every Papyrus event but OnUpdate unless a script on the handle is SkyUI's, RaceMenu's or
  defaultDisableHavokOnLoad" (ADR-029 context, DECISIONS.md:757-770; its "but OnUpdate", like apocalypse-options.md 3.1's, is the misreading corrected above, OnUpdate is blanked too); the admitted scripts "run UI,
  not game state" (FridaHooks.cpp:111; docs/architecture/thuum-system.drawio:637).

## 2. The failure chain, script by script

- Apocalypse: `object WB_MCMQuest_Script extends SKI_ConfigBase` (lab/pex.py dump of
  lab/.cache/mods/apocalypse-10.2.3/scripts/wb_mcmquest_script.pex); it defines OnPageReset,
  OnOptionSelect, OnOptionHighlight, OnOptionDefault, OnOptionSliderOpen and OnOptionSliderAccept, and
  overrides neither OnConfigInit nor OnGameReload.
- SkyUI's registration (SkyUI 5.1 sources, schlangster/skyui master dist/Data/Scripts/Source; the
  layer's 6.11 pex in SkyUI_SE.bsa disassemble to the same calls):
  - `SKI_ConfigBase extends SKI_QuestBase` (psc:1); `SKI_QuestBase extends Quest` (SKI_QuestBase.psc:1).
  - `OnInit` calls `OnGameReload()` (SKI_ConfigBase.psc:36-38). `OnGameReload` calls `OnConfigInit()`
    the first time (:54) and `RegisterForModEvent("SKICP_configManagerReady", "OnConfigManagerReady")`
    (:57). `OnConfigManagerReady` calls `newManager.RegisterMod(self, ModName)` (:497-516).
    `OnPageReset(a_page)` is called by SKI_ConfigBase itself (:574).
  - `SKI_ConfigManager` sends `SendModEvent("SKICP_configManagerReady")` from OnGameReload (:86) and
    from OnUpdate every 5 s six times, then every 30 s (:98), and shows the HUD notification
    "MCM: Registered N new menu(s)." (OnUpdate; 6.11 pex: the `'MCM: Registered '` strcat).
  - `SKI_PlayerLoadGameAlias.OnPlayerLoadGame` calls `(GetOwningQuest() as SKI_QuestBase).OnGameReload()`
    (SKI_PlayerLoadGameAlias.psc:5-7); SKI_QuestBase.psc:36-39 tells mod authors to put it on a player
    alias of their config quest. apocalypse-options.md:581-584 says Apocalypse's quest does (INFERRED).
- Which steps pass through the hooked entry: `OnInit` on the quest's handle (engine to VM),
  `OnPlayerLoadGame` on the alias's handle, and the mod-event callbacks: SKSE delivers a registered
  handle's callback through the VM's SendEvent, the shape CommonLib's own RegistrationSet shows,
  `vm->SendEvent(handle, eventName, args)` (include/SKSE/RegistrationSet.h:84-91; SKSE's dispatch
  itself is HYPOTHESIS by that shape). The direct calls (OnGameReload, OnConfigInit, RegisterMod,
  OnPageReset) are `callmethod` and never meet the hook (HYPOTHESIS, section 1).
- Handle by handle, with the block on: the alias handle's scripts are `[SKI_PlayerLoadGameAlias]`,
  admitted by prefix, so after skymp5-client's `loadGame` (a real save load, LoadGame.cpp:118-119 and
  :129; loadGameService.ts:13) OnPlayerLoadGame runs, OnGameReload runs on the quest object by direct
  call, OnConfigInit runs, the mod event is registered (HYPOTHESIS that OnPlayerLoadGame fires after
  SP's load). The quest handle's scripts are `[WB_MCMQuest_Script]`: `OnInit` is blanked and
  `OnConfigManagerReady` is blanked every 5 s, so `RegisterMod` is never called and the list has no
  entry. The mod's own menu code is intact and idle.
- The six others fail the same test. Direct children of SKI_ConfigBase: `_ts_DR_MCMConfig` (IDRC,
  Source/Scripts/_ts_DR_MCMConfig.psc:1), `JewelryLimitMCM` (scripts/source/JewelryLimitMCM.psc:1),
  `RL_ManagerScript` (Reading List, Scripts/Source/RL_ManagerScript.psc:1). Through MCM Helper:
  `MCM_ConfigBase extends SKI_ConfigBase` (MCMHelper.bsa, mcm_configbase.pex), `TrueHUD_MCM extends
  MCM_ConfigBase` (TrueHUD_MCM.pex), `StealthKillDetectionFix_MCM extends MCM_ConfigBase` (psc:1);
  TDM's MCM script is not in the cache (HYPOTHESIS: MCM_ConfigBase too, TrueHUD's author). SkyUI's
  own entry survives because MCM Helper's replacement `SKI_ConfigMenu extends MCM_ConfigBase`
  (MCM Helper Source/Scripts/SKI_ConfigMenu.psc:1) still starts with `SKI_`.

## 3. Learning a script's class and parents at the hook (CommonLibSSE-NG)

- `using VM = RE::BSScript::Internal::VirtualMachine;` (SP PCH.h:84); `static VirtualMachine*
  GetSingleton();` (include/RE/V/VirtualMachine.h:175). The hook already holds `vm`.
- The attached-script table: `BSTHashMap<VMHandle, BSTSmallSharedArray<AttachedScript>>
  attachedScripts;` under `mutable BSSpinLock attachedScriptsLock;` (VirtualMachine.h:219-220).
  `AttachedScript : BSTPointerAndFlags<BSTSmartPointer<Object>, 1>` (include/RE/A/AttachedScript.h:13-17),
  whose `get()` yields `Object*` (include/RE/B/BSTPointerAndFlags.h:58); `BSTSmallSharedArray`
  gives `operator[]`, `size()`, `begin()/end()` (include/RE/B/BSTArray.h:707-745). `VMHandle` is
  `std::uint64_t`, `VMTypeID` `std::uint32_t` (include/RE/B/BSCoreTypes.h:7, :9).
- From a script object to its class: `Object::GetTypeInfo()` (include/RE/O/Object.h:20-21; src/RE/O/
  Object.cpp:24-27 returns `type.get()`, the member `BSTSmartPointer<ObjectTypeInfo> type; // 08`,
  Object.h:43).
- From a class to its name and parent: `const char* GetName() const;` and `ObjectTypeInfo* GetParent();`
  (include/RE/O/ObjectTypeInfo.h:126-128); bodies `return name.c_str();` and `return
  parentTypeInfo.get();` (src/RE/O/ObjectTypeInfo.cpp:30-43); members `BSFixedString name; // 08` and
  `BSTSmartPointer<ObjectTypeInfo> parentTypeInfo; // 10` (ObjectTypeInfo.h:177-178). The chain ends
  where `GetParent()` returns null (HYPOTHESIS: the root type has an empty parentTypeInfo).
- Alternatives the headers offer, none needed here: `ForEachBoundObject(handle, functor)`
  (IVirtualMachine.h:77), `FindBoundObject(handle, className, out)` (:81), `GetScriptObjectType1
  (className, out)` (:56) to fetch SKI_ConfigBase's type once and compare pointers. There is no
  `GetScriptObjectsWithEvent` in these headers. The handle policy's `HandleIsType` and
  `GetObjectForHandle` (include/RE/I/IObjectHandlePolicy.h:20, :27) are what the hook uses already.

## 4. The smallest change

(a) Walk the parent chain where the leaf name is tested today. Pseudo-diff for FridaHooks.cpp:

    +// A script passes if it, or any class it extends, is SkyUI's (SKI_*): a mod's MCM is a script
    +// extending SKI_ConfigBase (WB_MCMQuest_Script, JewelryLimitMCM, _ts_DR_MCMConfig,
    +// RL_ManagerScript) or MCM Helper's MCM_ConfigBase, which extends it (TrueHUD_MCM,
    +// StealthKillDetectionFix_MCM). Until train-29 only the leaf class was read, so SkyUI's
    +// SKICP_configManagerReady callback never reached a mod's config quest (SKI_ConfigBase
    +// OnConfigManagerReady -> RegisterMod) and the MCM listed SkyUI alone (playtests 26, 27).
    +static bool ExtendsSkyUi(const RE::BSScript::ObjectTypeInfo* info)
    +{
    +  for (int depth = 0; info && depth < 16; ++depth, info = info->GetParent()) {
    +    auto name = info->GetName();
    +    if (name && !strncmp(name, "SKI_", 4)) {
    +      return true;
    +    }
    +  }
    +  return false;
    +}
     ...
    -        const char* skyui_name = "SKI_"; // start skyui object name
    -        if (strlen(name) >= 4 && name[0] == skyui_name[0] &&
    -            name[1] == skyui_name[1] && name[2] == skyui_name[2] &&
    -            name[3] == skyui_name[3]) {
    +        if (ExtendsSkyUi(info)) {
               blockEvents = false;
               break;

The helper sits above `OnSendEventEnter` (FridaHooks.cpp:23-27); the RaceMenu, GRIM_ALT,
WB_DestroyAfterDelay_Script and defaultDisableHavokOnLoad branches and the ActiveEffect halves stay
as they are. `strncmp` keeps today's case-sensitive compare (pex files keep the author's case).
No wire, no validator, no schema: this is a client HOOK change under rule 3's "whole verb" only as
part of train-29's SkyUI layer row.

(b) A data list (a comma list of admitted base classes in Skyrim Platform's settings file,
`Settings::File::GetString`, Settings.h:17 and :171, read through `GetPlatformSettings`,
Settings.cpp:8-10; or a `TESModPlatform` native the client calls) would satisfy "the allowlist is data,
not code" (ADR-008, DECISIONS.md:95-97; ADR-029, :789). It is not the smallest change: four
names and one prefix, no deployment that wants them different. File it as a follow-up if a third
layer asks for a fifth name.

Cost per event. The hook already pays, for every non-OnUpdate event while blocked: two
`GetObjectForHandle` (FridaHooks.cpp:42-47), one hash lookup (:87), and per attached script one
`GetTypeInfo`, one `GetName` and up to five compares (:94-139). The walk adds, per attached script,
at most the chain's length in pointer reads and 4-byte compares, stopping at the first `SKI_`: depth 1
for WB_MCMQuest_Script, 2 for the MCM Helper mods, 4 to 5 to reject a vanilla script (Quest, Form).
Sub-microsecond, under the lock the code already holds. Rate at this hook: HYPOTHESIS, unmeasured:
tens of events per second in play (effects, hits, OnLoad/OnUnload of scripted references), bursts of
hundreds at a cell load; the chattiest, OnUpdate, is blanked at :85 without the lookup. A counter in
push-trace.js's pattern on 104800 (push-trace.js:8-11, :23-25) measures it in one run.

Risks.
- JS sees nothing new. The JS hook (`hooks.sendPapyrusEvent`, docs/skyrim_platform/events.md:7-32)
  is fed at FridaHooks.cpp:52-53, before the blank, filtered by selfId and pattern (Handler.cpp:20-32);
  nothing in skymp5-client or the gamemode registers one (only the typings mention it). The fix
  changes what the VM runs, not what JS receives.
- Engine side: the seven MCM scripts now run in each client. Apocalypse's writes its 30 MCM globals
  (DECISIONS.md:771-773): R2, each player's, polled and reported once a second by player-globals
  (docs/verbs/player-globals.md:36-37, :44-47, :75), exactly ADR-029's design (DECISIONS.md:801-805).
  Its MCM also edits leveled lists at runtime (apocalypse-options.md:157, :181): client-local, and
  the server computes inventory (R0), so at most a cosmetic divergence (HYPOTHESIS). Jewelry Limiter's
  OnConfigClose (36 instructions) may unequip rings: the same equip relay a player's own action takes
  (HYPOTHESIS). Reading List's RL_ManagerScript is its MCM and its manager; its detection scripts
  (RL_DetectedBookScript, RL_DetectBooksInventoryScript) extend nothing SkyUI's and stay blanked: the
  menu lists, the tracking stays dead, as today. IDRC, TDM, TrueHUD and SDF settings feed their DLLs
  through MCM Helper's natives: client-local.
- Breadth: any mod quest extending SKI_QuestBase (not only ConfigBase) passes too; none known in the
  layer (HYPOTHESIS). SkyUI's own non-UI scripts (SKI_FavoritesManager and kin) already pass today.
- Safety: a null name or a cyclic chain is bounded by the null check and the depth cap; parent
  pointers are refcounted smart pointers the VM holds (ObjectTypeInfo.h:178), the same lifetime
  assumption as today's `GetName` read under `attachedScriptsLock` (HYPOTHESIS).

## 5. The decisive in-game check (before the fix, on the layer)

Open Journal, System, Mod Configuration about a minute after load (the manager resends every 5 s six
times, then every 30 s; SKI_ConfigManager.psc:98) and write down the entries. The layer holds four
direct SKI_ConfigBase menus (Apocalypse, IDRC, Jewelry Limiter, Reading List) and three MCM Helper
menus (TDM, Stealth Detection Fixes, TrueHUD), plus SkyUI's own (mods-fenestrate.md:26, :34, :41,
:42, :65, :71, :84, :110).
- Only "SkyUI" listed, none of the seven: the block, this memo's cause. The HUD at load showed
  "MCM: Registered 1 new menu(s)." on a fresh world (SkyUI's SKI_ConfigMenu alone).
- The six others listed, Apocalypse alone missing: the mod's own registration (its config quest not
  running, its player alias without SKI_PlayerLoadGameAlias, an empty ModName, or a Papyrus error
  in its OnConfigInit), not the hook. apocalypse-options.md:581 says the alias is there (INFERRED).
- The four direct children missing and the three MCM Helper menus present: MCM Helper registers by
  another path; the block still explains Apocalypse and the MCM Helper HYPOTHESIS falls.
- Not even "SkyUI": SkyUI's manager quest is not running (load order, BSA), a layer problem to settle
  before any hook change.
Playtest 27's section 4 asks exactly this question (docs/private/playtest-m2-27.md:71-74).

## 6. The test

No T1 reaches it (the VM and SkyUI's quests run only in a game). Lab, as a probe scenario in its own
commit (rule 13), `x-mcm-register`: one seat logs in; `c1: frida {script: hud-trace.js}` from the
login, since hud-trace hooks DebugNotification (52933) and the HUD queue (13631) (lab/frida/
hud-trace.js:1-14), then `wait: 45` (one OnGameReload send plus six 5 s resends); the run's
`frida/*.jsonl` artifact (docs/LAB.md:366-371, :674-677) must carry a notification line
"MCM: Registered N new menu(s)." with N summing to 8 under the fix (SkyUI plus the seven) and to 1
on the unfixed build; the first run reads the jsonl by hand, and a `<client>.frida_printed(text)`
predicate is a small lab-api addition beside `<client>.printed(text)` (lab/labapi/labapi/
assertions.py:32, :1077-1078, console lines only). A second tracer, in push-trace.js's shape on
104800, logs each `OnConfigManagerReady` with the handle's attached class names and their parents
walked from the same table, which shows the blanked event and the chain the fix reads, before any
build. SkyUI's `Debug.Trace(self + ": Registered " + ModName + " at MCM.")` (SKI_ConfigBase.psc:
497-516) lands in Papyrus.0.log, which the lab neither enables nor collects, so the HUD line is the
collected signal. T4 at the next playtest: the list shows "Apocalypse - Magic of Skyrim" and the other
six, and `b-player-globals` test 1 changes an Apocalypse setting (playtest-m2-27.md:71-74 and the
twenty-six checklist's 38-45).
