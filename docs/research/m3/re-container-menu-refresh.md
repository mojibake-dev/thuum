# RE: the ContainerMenu's in-place refresh, or what redraws an open chest when its inventory changes under it (2026-10-28, 17:57 PDT)

The re-analyst's read for memo D52 B after playtest 37 (docs/research/m3/decisions-after-npc-stream.md, D52; the
fork's two refreshes in skyrim-platform PuppetApi.cpp `RefreshContainerMenu`, commit ef7b427d on m3-face-twelve, both
of which "took the store side" and showed no new rows). pyghidra on SkyrimSE 1.6.1170 (the program
`/SkyrimSE-1.6.1170.0.exe.unpacked.exe`; REA was disconnected again). Every Address Library ID below is the AE id, a
reverse lookup of the RVA in addrlib/versionlib-1-6-1170-0.bin through lab/addr.py; every CommonLibSSE-NG name is cited
to its header in this tree (the b93280e8 pin). Engine names beyond CommonLib's are HYPOTHESIS, as is every inferred side
effect, until the Frida plan at the end confirms them. Skyrim Souls RE (github.com/Vermunds/SkyrimSoulsRE, the mod the
seats run unpaused menus with) was read for which functions it hooks, nothing more. The fork's code read at the
submodule's HEAD: skymp5-client/src/sync/inventory.ts (`applyInventory`, `resetBase`), skymp5-client/src/view/
formView.ts and modelApplyUtils.ts, skyrim-platform PapyrusTESModPlatform.cpp (`AddItemEx`).

## The short answer

The engine has exactly one refresh primitive for item menus, and the fork already used it, once directly and once through
`ItemList::Update`. The function at **52849 (RVA 0x976a80)**, which Skyrim Souls RE's Offsets.h also names
`RequestItemListUpdate` (HYPOTHESIS name; CommonLib has no binding), takes `(TESObjectREFR* owner, TESBoundObject* obj)`
and, when an inventory item menu is on the stack (`UI::numItemMenus`, UI.h:122) and the take-all suppress byte (405989,
0x31af788... see the table) is clear, posts `UIMessageQueue::AddMessage(InterfaceStrings::topMenu, kInventoryUpdate, data)`
(AddMessage 13631, 0x1af260; UIMessage.h:19; InterfaceStrings.h:38 "Top Menu" at +0xD0) with an `InventoryUpdateData`
(InventoryUpdateData.h) whose `inventoryRef` is the owner's handle (CreateRefHandle 12326) and whose `updateObj` is `obj`,
null included. Vanilla's script path is this call with `obj == nullptr`: `ObjectReference.AddItem` (56489 for a base
form, 56490 for a reference) and `ObjectReference.RemoveItem` (56098, helper 56647) each end with
`RequestItemListUpdate(self, nullptr)`. One message, both sides.

`ContainerMenu::ProcessMessage` (51126, 0x8f9fb0; the vtable slot 4 of VTABLE_ContainerMenu 215061 at 0x18f32f0,
Offsets_VTABLE.h:4008, IMenu.h:70) handles type 8 like this: it ignores the message unless `inventoryRef` equals the
player's handle static (403520, 0x31874f4; HYPOTHESIS: the player's RefHandle, read by more than a hundred gameplay
functions and written once at the player's creation) or the menu's target static (405962, 0x31ace80, which IS
`ContainerMenu::GetTargetRefHandle`, ContainerMenu.cpp:13). A null `updateObj` runs `UpdateItemList` (51144) and
`UpdateBottomBar` (51143, Skyrim Souls' name; it invokes the Flash `UpdatePlayerInfo`). A non-null `updateObj` only
queues the object in a sorted dirty set at this+0x60 (CommonLib's `unk60`, ContainerMenu.h:37) and returns; nothing
redraws until a null message arrives. `UpdateItemList` rebuilds the whole list when the dirty set is empty and only the
dirty objects' rows when it is not (51146), then sorts, flags, restores the selection and invokes `InvalidateListData`.

The list is ONE list for both panels. A row's side is `StandardItemData::owner` (StandardItemData.h:23), the handle of the
inventory it came from, compared with the player's handle inside `StandardItemData::GetFilterFlag` (51806, 0x929940): a
row the player does not own has its category bits shifted left by ten, into the mask 0xFFC00 the menu hands Flash as
the container's "all" category at kShow. So `ItemList::Update(owner)` never selects a side; the owner only decides
whether the ContainerMenu accepts the message (player or target). `ItemList::Update_Impl` (51031, Offsets.h:351) does
two things: it sets `ItemList::unk50 = 1` (ItemList.h:36) and calls 52849(owner, nullptr). `unk50` stays set until a
null message is processed by this menu, and `ItemList::GetSelectedItem` (51017) returns null while it is set
(ItemList.cpp:10-12 reads the same byte). Every menu action (ItemTransfer, EquipItem, ToggleFavorite, TakeAllItems,
RequestItemCardInfo, UpdateItem3D) starts from `GetSelectedItem`, so a stuck `unk50` is exactly "the player could no
longer place items".

Statically, the fork's first refresh is the vanilla message addressed by name instead of "Top Menu" (the dispatcher,
`UI::ProcessMessages` 82082, resolves both to the same instance and never drops type 8), and the second is one more copy
of it. The static read finds no fault in the message. It finds three traps around it, two of which fit the symptoms:

1. The dirty-set trap. `TESObjectREFR::RemoveItem` (19689, vtable slot 0x56) posts `{this, item}` itself after
   `InventoryChanges::RemoveItem` (16059); `TESObjectREFR::AddObjectToContainer` (19708, slot 0x5A) posts nothing. The
   fork's applier removes through the engine and adds through the engine too (AddItemEx's deferred task,
   PapyrusTESModPlatform.cpp:751-767), so after a mixed batch the dirty set holds the removed objects and the FIRST null
   message redraws only those; added objects appear only on a SECOND null message, when the dirty set is empty. Skyrim
   Souls RE's ItemMenuUpdater calls 52849 twice in a row with the comment "Updating twice in a row seems to fix it for
   some reason": this is the reason.
2. The unk50 trap. `ItemList::Update(target)` blanks `GetSelectedItem` until a null message is processed by the
   ContainerMenu. Any ordering in which the fork's messages are processed before the batch lands, or are not processed,
   leaves the menu stale AND dead to selection. Never call `ItemList::Update` from the native; post the message.
3. The AddItemEx guard. `TESModPlatform::AddItemEx` returns without doing anything while `UI::GameIsPaused()`
   (PapyrusTESModPlatform.cpp:662-664, UI.cpp:13-16); the engine change itself lands in a later gameThrQ task
   (:751-767), after the native has returned to JS. A refresh posted from JS right after the apply races the tasks.

Recommended refresh (Q4a), the engine's own shape, nothing of ours: from the game-thread task that performs the LAST
engine-level change of a batch (inside AddItemEx's task, or a task queued after all of them), call 52849 once per
changed object with that object (the dirty shape RemoveItem uses) and once with `nullptr` at the end (the incremental
redraw of exactly those rows, both sides); or, simpler and equally vanilla, `52849(container, nullptr)` twice after the
batch (Skyrim Souls' shape: the first flushes any dirty objects, the second rebuilds everything). Address "Top Menu"
(that is what 52849 does): the dispatcher walks type 8 down the stack through modal menus, so a Quantity Menu or
MessageBox above the chest does not matter. Do not call `ItemList::Update`. Keep the posting in one place.

## Q1. ContainerMenu::ProcessMessage (51126, 0x8f9fb0), case by case

Identification: VTABLE_ContainerMenu AE 215061 resolves to 0x18f32f0 (`just addr 215061`); its nine slots read
0x8fee90 (dtor, 51172), 0x8faed0 (Accept, 51128), the shared PostCreate/Unk_03 stubs, 0x8f9fb0 (ProcessMessage, 51126),
the IMenu AdvanceMovie, 0x8fae90 (PostDisplay, 51127), the IMenu PreDisplay and RefreshPlatform (IMenu.h:62-74). The
string "ContainerMenu" sits right after the vtable and the constructor (51124, 0x8f9c70) loads the movie with it, sets
`menuFlags = 0xA489` (exactly CommonLib's comment list, ContainerMenu.h:14), `depthPriority = 0`, `inputContext = 3`
(kItemMenu), fetches "Menu_mc" and `bPCControlsReady` (the byte at this+0xB9, CommonLib's `pcControlsReady`,
ContainerMenu.h:49). The same read done for BarterMenu (ProcessMessage 50945, 0x8ea7e0), InventoryMenu (51848,
0x92c5d0) and GiftMenu (51565, 0x918a30); all four fetch `_root.GetInventoryItemList`.

The handler switches on `UIMessage::type` (UIMessage.h:31):

- kShow (1): `Inventory3DManager` begin (51754 on the singleton 403559); `_root.GetInventoryItemList` on the movie;
  allocates the `ItemList` (0x58 bytes: view, root, `entryList` = root.GetMember("entryList"), items, `unk50 = 0`;
  ItemList.h:31-39) into this+0x48, the `ItemCard` (0x40) into this+0x50 and the `BottomBar` (0x18) into this+0x58
  (the RUNTIME_DATA at +0x30, ContainerMenu.h:33-36, the AE column); sets `bNPCMode` on the root to (mode is
  kPickpocket or kNPCMode; the `ContainerMode` static 405937 at 0x31acdb8 is `ContainerMenu::GetContainerMode`,
  ContainerMenu.cpp:7); invokes "SetCategoriesList" (51142, 0x8fc720) with the target's display name
  (`TESObjectREFR::GetDisplayFullName` 19781), the mask 0xFFC00 and `true`, a second string with flag 0, and the
  player's name; runs `UpdateItemList` (51144) and `UpdateBottomBar` (51143); if `pcControlsReady`, invokes
  "ShowItemsList". Returns kHandled.
- kHide (3): in kPickpocket mode, each object in the pickpocketed array (this+0x78, count at +0x88) is reported through
  the crime path (FUN_1405bc010, not read); `Inventory3DManager` end (51756); the rows are freed (51014), then the
  ItemList, ItemCard and BottomBar. Returns kHandled.
- kUserEvent (7): `BSUIMessageData::fixedStr` (+0x18, BSUIMessageData.h:24) against `UserEvents`: "Item Zoom" (+0x338,
  UserEvents.h:171), or "Cancel" (+0x130, :106) while the item 3D is at rest, invokes "ToggleMenuFade"; "LeftEquip"
  (+0x228, :137) invokes "AttemptEquip"(1); "RightEquip" (+0x230, :138) "AttemptEquip"(0); "XButton" (+0x300, :164)
  "XButtonPress"; "YButton" (+0x308, :165) reads the root's `isViewingContainer` and, when false, runs ToggleFavorite
  (51150; "You cannot favorite that item." on failure). Returns kHandled.
- kInventoryUpdate (8): `data = message.data` (UIMessage.h:33), read as `InventoryUpdateData`: `inventoryRef` at +0x10,
  `updateObj` at +0x18 (InventoryUpdateData.h:17-19). If `data` is null, or `inventoryRef` is neither the player's
  handle (403520) nor the target handle (405962): return kHandled, nothing done, and `ItemList::unk50` is NOT touched.
  If `updateObj == nullptr`: `UpdateItemList(this)` (51144) then `UpdateBottomBar(this)` (51143); if the ref was the
  player's, the player's process is asked to re-evaluate equipment (FUN_140711b40 / FUN_1406e3b70 on
  `PlayerCharacter::currentProcess`, HYPOTHESIS) and the static byte 405989 is cleared. If `updateObj != nullptr`: the
  object is inserted into the sorted dirty set (this+0x60, size +0x70, membership test 51162) and, when the ref was the
  player's and the object is armor (FormType 0x1A, FormTypes.h:166) worn by the player, 405989 is set. Returns kHandled.
  No list function runs on this branch.
- type 12 (CommonLib's kUpdateController): a command string at data+0x10 and a "handled" flag the menu writes at
  data+0x18 (52861). Recognized: column numbers 1..9 and 11..20 (category jumps on the root), "Closing All Menus"
  (InterfaceStrings +0x240) which posts kHide to "ContainerMenu" itself, three sort toggles that write the sort column
  at this+0xB4 (CommonLib's `unkB4`, ContainerMenu.h:47) and rerun `UpdateItemList`, and take-all variants (51153) with
  value-per-weight thresholds written to the float at 382744 (FLT_MAX, 5, 10, 25, 50, 100). HYPOTHESIS: the Kinect
  voice-command channel ("Kinect Menu", "KinectUserEventData" in InterfaceStrings.h:74-76). Not our path.
- everything else (kUpdate 0, kReshow 2, kForceHide 4, kScaleformEvent 6, ...): while the item 3D zoom is at rest,
  `IMenu::ProcessMessage` (82306, 0xfaed60): kScaleformEvent goes to the movie and returns kHandled; every other type
  returns kPassOn.

What `UpdateItemList` (51144, 0x8fcac0) does, in order: if the dirty set is empty, look up the target (405962), build a
context {target, mode, the target actor's relationship rank to the player (FUN_14068f9f0, HYPOTHESIS), ownership
(FUN_1401db340 on the base container, HYPOTHESIS), side}, clear the rows (51014), add every entry of the player's
`InventoryChanges` (16039, the no-init getter: ExtraDataList type 0x15, ExtraDataTypes.h:195) with side 0, then every
entry of the target's `InventoryChanges` (16040, the getter that creates the ExtraContainerChanges when missing) with side
1, through 51156 (`FUN_1408fdef0`: the per-entry filter 51171 drops what this side may not show, 51011 makes the row,
50981 fills its Flash members); if the dirty set is not empty, 51146 instead: remove every row whose object is dirty
(50976), then re-add those objects from both inventories (51157). Then: the target actor's equipped weapon and shield
(51147, NPC mode), clear the dirty set, sort per this+0xB4 (51163 for the default order, which also clears
`ItemList::unk50`; the other orders clear it after sorting), set per row "enabled" (51118: the carrier's weight room,
the player's rows against the target actor's capacity and the container's rows against the player's) and "isStealing"
(51160), "bestInClass" (51832), restore the remembered selection when `pcControlsReady` is false (51815), and invoke
`InvalidateListData` on the movie (via FxDelegate; the ItemList's own invalidate is 51028).

## Q2. The vanilla path of a container change under an open menu

Engine level, no message of its own except from RemoveItem:

- `TESObjectREFR::RemoveItem` (19689, 0x2e1750; TESObjectREFR.h:282, vtable slot 0x56 of VTABLE_TESObjectREFR 190259 at
  0x17ae180): `InventoryChanges::RemoveItem` (16059, 0x228180, HYPOTHESIS name) on this ref's changes (16039), the
  actor's AI/equipment reaction when this is an actor, then **52849(this, item)**: a message `{this ref's handle, item}`
  to "Top Menu". The DESTINATION of a move (`a_moveToRef`) gets no message from here; it receives the object through
  `AddObjectToContainer`, which posts nothing. `Actor::RemoveItem` (37797, 0x692800) calls this and adds the equipment
  handling.
- `TESObjectREFR::AddObjectToContainer` (19708, 0x2e23d0; TESObjectREFR.h:286, slot 0x5A): ownership and reference
  bookkeeping on the extra list, then `InventoryChanges::AddItem` (16053, 0x226a20, HYPOTHESIS name) on the
  with-init changes (16040), which ends in `InventoryChanges::SendContainerChangedEvent` (16149, Offsets.h:339). **No UI
  message.** `Actor::AddObjectToContainer` (37525, 0x678f90) goes through the shared 19687 and adds equipment handling;
  still no message.

Script level, one message per call:

- `ObjectReference.AddItem` with a base form (56489, 0xa3d6a0; resolves leveled lists and form lists, adds through
  16127) and with a reference (56490, 0xa3d940; moves the reference's object into the container through 19687 and the
  HUD "Added" line 51636) both end with **52849(self, nullptr)**: `{self's handle, null}` to "Top Menu".
- `ObjectReference.RemoveItem` (56098, 0xa28e60; helper 56647, 0xa44fe0: per item `self->RemoveItem(item, count,
  otherContainer ? kStoreInContainer : kRemove, nullptr, otherContainer)`, TESObjectREFR.h:63-71) ends with
  **52849(self, nullptr)** as well; the per-item `{self, item}` messages from RemoveItem precede it in the queue, so
  the null message takes the incremental path for exactly those objects.
- Drop (56626, 0xa447f0, HYPOTHESIS: the drop path) posts `{believed container, null}` before placing the reference.

Menu level, the engine's own transfers: the Flash callbacks registered by `ContainerMenu::Accept` (51128): PlaySound,
UpdateItem3D (51129), RequestItemCardInfo (51130), CloseMenu, ItemTransfer (51132), EquipItem (51133),
QuantitySliderOpen (51134), TakeAllItems (51135 -> 51153), ToggleFavorite (51136 -> 51150), DisabledItemSelect,
StartMouseRotation, StopMouseRotation, ZoomItemModel (51138), CheckForMouseEquip (51139). ItemTransfer and EquipItem
move one entry through 51141 (`FUN_1408fc110`: the source's `RemoveItem` with the right reason and `moveToRef`, the
player's or the target's; this is where RemoveItem's `{source, item}` comes from), then end with
`ItemList::Update(player)`: `unk50 = 1` and `{player, null}`. TakeAllItems (51153) sets the suppress byte 406594
(0x31af788) so the per-item RemoveItems post nothing, moves everything, clears the byte and posts kHide to itself. The
ToggleFavorite path (51150) edits the hotkey extra (16098/16099) and ends with `ItemList::Update(player)`.

The dispatcher, `UI::ProcessMessages` (82082, 0xfa3fa0; Skyrim Souls' name, it is the only code caller of
`UIMessageQueue::ProcessCommands` 82167): under the `processMessagesLock` (UI.h:128) it sorts `menuStack` (UI.h:126) by
`depthPriority` (IMenu.h:107), then pops messages. "Top Menu" is the topmost stack entry with `depthPriority < 14`
(82081); a named menu is `menuMap[name].menu` (UI.h:127). kShow creates the menu through its registered creator when
absent, calls PostCreate, calls ProcessMessage and pushes it (an item menu while `numItemMenus != 0` is refused; a menu
already on the stack gets the message as kReshow, type 2); kHide and kForceHide pop after ProcessMessage. Every other
type, type 8 included: a target not on the stack gets the message directly; a target on the stack gets it, then the
walk continues DOWN the stack while the answer is kPassOn (IMenu.h:47-52), and a kModal menu ends the walk for every
type EXCEPT 8. The ContainerMenu answers kHandled to type 8, so the walk stops at it. After the pass,
`UIMessageQueue::ProcessCommands` (82167) deletes heap-allocated data (byte +9 == 0) and frees pooled data (clears the
in-use byte +8; IUIMessageData.h:13 `unk08` is that pair), and a kUpdate message is walked from the top (depth < 10)
to menus flagged kRequiresUpdate.

One message or two: ONE accepted message rebuilds both sides, because the ItemList is one list and `UpdateItemList`
always reads both inventories. A second null message is needed only when engine-level RemoveItems have queued objects
in the dirty set and ADDED objects must also appear (the first null is incremental and sees only the dirty objects).

The message's fields, exactly: menu = `InterfaceStrings::GetSingleton()->topMenu` ("Top Menu", InterfaceStrings.h:38;
the singleton 400446, Offsets.h:328); type = `UI_MESSAGE_TYPE::kInventoryUpdate` (8, UIMessage.h:19); data = an
`InventoryUpdateData` with `inventoryRef = container->GetHandle()` (TESObjectREFR.h:397; the engine uses CreateRefHandle
12326 when the ref's handle refcount bits are non-zero and the null-handle static 400312 otherwise) and
`updateObj = nullptr` for a full redraw or the `TESBoundObject*` for the dirty shape. Allocation: the engine creates
the data through the message-data factory (its lookup at 35855, 0x61bba0, reads the same static map CommonLib wraps as
`MessageDataFactoryManager::GetCreator<InventoryUpdateData>(strings->inventoryUpdateData)`, BSTCreateFactoryManager.h:
30-41; InterfaceStrings.h:27 `inventoryUpdateData` at +0x58; heap, deleted by the UI pass). CommonLib's
`UIMessageQueue::CreateUIMessageData` (82169; UIMessageQueue.h:25) hands out a pooled object from the queue's map at
+0x348 instead, and the UI pass marks it free; both are accepted. The simplest faithful call is the engine's own:

```cpp
// HYPOTHESIS until the trace: the engine's RequestItemListUpdate (AE 52849; no SE id in our database, AE-only build)
using RequestItemListUpdate_t = void (*)(RE::TESObjectREFR* a_owner, RE::TESBoundObject* a_obj);
REL::Relocation<RequestItemListUpdate_t> requestItemListUpdate{ REL::ID(52849) };
requestItemListUpdate(containerRefr, nullptr);   // {container handle, null} to "Top Menu"
```

## Q3. ItemList::Update(owner) in a ContainerMenu

`ItemList::Update_Impl` (51031, 0x8efb90 = `Offset::ItemList::Update`, Offsets.h:351): set the TLS memory context,
`this->unk50 = 1`, `52849(owner, nullptr)`, restore. That is all; it does not touch `items`, `entryList` or the movie.
The redraw happens later, in the ContainerMenu's handler, which rebuilds BOTH panels whichever accepted handle the
message carries. There is no per-side state in the menu besides the per-row `StandardItemData::owner` and the Flash
root's `isViewingContainer` (which the C++ only reads, in the YButton and book paths). The `ContainerMode` static
(405937) only shapes the context (pickpocket chance per row in kPickpocket, the target's capacity in kNPCMode).

The `inventoryLists` Scaleform object: the C++ caches the display object `_root.GetInventoryItemList()` returns
(CommonLib's comment names it `_level0.Menu_mc.inventoryLists.panelContainer.itemList`, ItemList.h:33) and its
`entryList` array (ItemList.h:34). Each row is a GFxValue object pushed into `entryList` (ItemList::Item::obj, ItemList.h:
21) with the members the StandardItemData vfuncs supply at creation (50981): the name, `count`, `equipState`,
`filterFlag`, `favorite`, `enabled`, plus `soulLVL` for soul gems (51819); the menu then sets `enabled` and `equipState`
(51118), `isStealing` (51160) and `bestInClass` (51832) per row. `GetFilterFlag` (51806) is the side: category bits by
form type (Scroll 0x17 -> 0x10, Armor 0x1A -> 4, Book 0x1B -> 0x80, Ingredient 0x1E -> 0x40, Weapon 0x29 and Ammo 0x2A
-> 2, Key 0x2D -> 0x100, AlchemyItem 0x2E -> 0x20 when food else 8 or 0x200, everything else 0x200; FormTypes.h:163-186),
bit 1 for a favorite, and the whole value shifted left by ten when `owner != player's handle`; the helper 51820 tests
`flag & 0xFFC00` wherever the menu needs "is this a container row". `GetCount` (51804) and `GetName` (51803) read the
`InventoryEntryData` (16004, 16018); `GetEquipState` (51805) reads the owner actor's equipped objects.

So the premise "updating with the container as owner removes the player's side" has no static support: the owner
argument selects nothing. What the call does do is set `unk50`, and `GetSelectedItem` (51017) returns null while it is
set, which disables every action (ItemTransfer 51132, EquipItem 51133, ToggleFavorite 51150, TakeAllItems 51153, the
item card 51130 and the 3D 51129 all start from it). The sort step of the next processed null message clears it. If the
seat showed a stale list with dead selection, the null messages were not processed by this menu, or were processed
before the engine change landed (the batch's tasks in AddItemEx run later than the native's return), and the later
AddObjectToContainer calls posted nothing to redraw it afterwards.

## What the fork does today (read, not run)

`RefreshContainerMenu` (PuppetApi.cpp at ef7b427d:757-800): on gameThrQ, `UI::GetMenu<ContainerMenu>()`,
`ContainerMenu::GetTargetRefHandle()`, a formID check, then (1) `UIMessageQueue::CreateUIMessageData(strings->
inventoryUpdateData)` with `inventoryRef = handle`, `updateObj = nullptr`, `AddMessage(strings->containerMenu,
kInventoryUpdate, data)`, and (2) `menu->GetItemList()->Update(target)`. Statically (1) is the vanilla message with the
menu named instead of "Top Menu"; (2) is the same message again plus `unk50 = 1`.

The applier (skymp5-client/src/sync/inventory.ts:343-470, `applyInventory(refr, inventory, false, true)` from
modelApplyUtils.ts:9-11, called from formView.ts under the live-chest condition and from remoteServer.ts:299/749):
`resetBase` once per base form per session (`TESModPlatform.resetContainer(base)` then `refr.removeAllItems(null,
false, true)`: the engine's RemoveAllItems, whose per-object RemoveItems each post `{container, item}`; Skyrim Souls
RE's ItemMenuUpdater also posts two nulls from inside RemoveAllItems), then the diff against the engine's inventory,
then one `TESModPlatform.addItemEx` per entry. `AddItemEx` (PapyrusTESModPlatform.cpp:626-800): returns at once while
`UI::GameIsPaused()` (:662-664); builds the extra list; `gameThrQ->AddTask` (:751-767) that later runs
`AddObjectToContainer` (positive delta; no message) or `RemoveItem(..., kRemove, extra, nullptr)` (negative delta;
posts `{container, item}`). The client then calls `refreshContainerMenu(refId)` (formView.ts, the liveChest block),
whose task is queued after those tasks on the same gameThrQ. The read cannot see whether the queue drains all of them
before the UI pass that consumes the messages; the Frida plan does.

Skyrim Souls RE on the seats (source read for hook points only): `ContainerMenuEx` replaces vtable slot 4 of
VTABLE_ContainerMenu with a hook that forwards every message to the original (kShow: auto-close setup; kUpdate: the
pickpocket chance and the bottom bar's meters only; kHide: SkyUI's search widget); `ItemMenuUpdater` hooks
RemoveAllItems (16121 +0x3A, 441567 +0x55) and `TESObjectREFR::ResetInventory` (19802 +0x204) and calls 52849
(container, nullptr) twice when the container is the player or the open menu's target; `MenuProcessing` runs the
original `UI::ProcessMessages` (82082) and `AdvanceMovies` (82083) while the game is unpaused. Nothing intercepts type 8.
The IDs Souls names agree with the reverse lookups above (52849, 82082, 51143 `ContainerMenu::UpdateBottomBar`).

## Q4a. The refresh to perform

One native, `requestItemListUpdate(refId, objId = 0)` = 52849 on the game thread, and nothing else; both shapes are
the engine's:

- Faithful (the engine's transfer shape): from the game-thread task that performs each engine-level change (inside
  AddItemEx's task, after its AddObjectToContainer or RemoveItem), `52849(container, boundObject)`; from the task that
  ends the batch (queued after the last AddItemEx task, or the last task itself), `52849(container, nullptr)`. The
  ContainerMenu redraws exactly the changed rows on both sides, once. RemoveItem already posts its own dirty message, so
  the per-object call is only needed on the add side; calling it on both is harmless (the dirty set is a set).
- Simple (Skyrim Souls' shape): from the task that ends the batch, `52849(container, nullptr)` twice.

Rules either way: post from the game thread after the engine change has landed (not from JS after the native returned);
let 52849 choose the menu ("Top Menu"; it also checks `numItemMenus`); do not call `ItemList::Update`; do not pass the
player's handle for a chest (the message is accepted either way, but the armor bookkeeping branch is the player's);
check `UI::GameIsPaused()` is false on the seat when the menu is open (AddItemEx's guard), else nothing is applied at
all. If 52849 is not to be called by id, the equivalent is `AddMessage(strings->topMenu, kInventoryUpdate, data)` with a
factory-created `InventoryUpdateData` as above; the fork's `CreateUIMessageData` pooled object is also accepted.

## Q4b. Frida plan (the receiving seat, one change)

Hooks, all `Module.getBaseAddress("SkyrimSE.exe").add(rva)` (the lab's script conventions: lab/frida/, LAB_PARAMS, no
top-level name that shadows a Frida global):

| hook | AE id (RVA) | log |
|---|---|---|
| RequestItemListUpdate | 52849 (0x976a80) | args[0] formID (+0x14), args[1] formID or 0, return address (expect: 0x2e1750 RemoveItem, 0x8efb90 ItemList::Update, our native, Souls' hooks) |
| UIMessageQueue::AddMessage | 13631 (0x1af260) | the menu name (args[1] -> BSFixedString -> C string), type args[2]; for type 8 read data+0x10 (inventoryRef) and data+0x18 (updateObj -> +0x14) |
| ContainerMenu::ProcessMessage | 51126 (0x8f9fb0) | onEnter: message type (+8), data; for type 8 inventoryRef, updateObj, the statics 0x31ace80 (target) and 0x31874f4 (player), dirty count this+0x70, itemList = [this+0x48], its unk50 at +0x50 and row count at +0x48; onLeave: result, dirty count, unk50, row count |
| UpdateItemList | 51144 (0x8fcac0) | onEnter dirty count (0 = full, else incremental); onLeave row count, unk50 |
| ItemList::Update_Impl | 51031 (0x8efb90) | owner formID, return address |
| TESObjectREFR::AddObjectToContainer | 19708 (0x2e23d0) | this formID, object formID, count, timestamp |
| TESObjectREFR::RemoveItem | 19689 (0x2e1750) | this formID, object formID, count, reason, timestamp |
| UI::ProcessMessages | 82082 (0xfa3fa0) | enter/leave timestamps, to place the messages against the passes |

Scenario: x-container-shared's premise (two seats in one chest), the trace on the seat that does NOT move the item. Step:
the other seat takes one item, then puts one item; the server re-sends the inventory each time. Expected on the traced
seat, in order: AddItemEx's task (RemoveItem for the take, AddObjectToContainer for the put) with the chest's formID;
RemoveItem's own 52849(chest, item) and AddMessage(type 8, {chest, item}); our refresh's AddMessage(s) with {chest, 0};
within the next ProcessMessages pass, ProcessMessage type 8 with inventoryRef == the target static, UpdateItemList
entered with dirty = 1 (incremental) for the take and dirty = 0 (full) for the put, unk50 == 0 on leave, the row count
changed by the delta; the screenshot shows the row. If the fork's two-message native is traced as is, expect the second
message to run UpdateItemList with dirty = 0.

## Q4c. What would falsify this read

- AddMessage logs the type 8 message but ProcessMessage never sees it: the dispatcher or a hook drops it, and the
  routing read above is wrong (then post to "Top Menu" and trace 82082's walk).
- ProcessMessage sees type 8 with inventoryRef equal to neither static although the fork passed
  `GetTargetRefHandle()`: the handle statics in this build are not CommonLib's 405962/403520.
- UpdateItemList runs with dirty = 0, the row count matches the new inventory, unk50 is 0, and the screen still shows
  the old rows: the Flash side (the ContainerMenu.swf on the seats) ignores `InvalidateListData`; the fix is Flash-side
  (re-invoke "ShowItemsList" or the SWF's own update), not a message.
- unk50 stays 1 after a pass that ran UpdateItemList: the sort step does not clear it as read; then `ItemList::Update`
  must never be used and GetSelectedItem's dependence on it is the whole story.
- 52849 returns without posting while the chest is open: its `numItemMenus` guard is false under Skyrim Souls' flag
  changes; post the message directly instead.
- AddObjectToContainer's timestamps fall AFTER the ProcessMessages pass that consumed our null message: the ordering
  trap (3), fixed by posting from the batch's last task.

## IDs used (AE, 1.6.1170; every one a reverse lookup of the RVA; names beyond CommonLib's are HYPOTHESIS)

| name | id (RVA) | source of the name |
|---|---|---|
| ContainerMenu::ProcessMessage | 51126 (0x8f9fb0) | VTABLE_ContainerMenu 215061 slot 4 |
| ContainerMenu ctor / dtor / Accept / PostDisplay | 51124 / 51172 / 51128 / 51127 | vtable, "ContainerMenu" string |
| ContainerMenu::UpdateItemList (full or incremental) | 51144 (0x8fcac0) | this read; Souls has no name for it |
| ContainerMenu incremental update of the dirty set | 51146 (0x8fd190) | this read |
| ContainerMenu::UpdateBottomBar ("UpdatePlayerInfo") | 51143 (0x8fc9f0) | Skyrim Souls RE Offsets.h |
| ContainerMenu "SetCategoriesList" | 51142 (0x8fc720) | this read |
| ContainerMenu transfer one entry | 51141 (0x8fc110) | this read |
| ContainerMenu TakeAllItems body | 51153 (0x8fdd60) | this read |
| ContainerMenu ToggleFavorite body | 51150 (0x8fd9f0) | this read |
| ContainerMenu callbacks ItemTransfer / EquipItem / equip body | 51132 / 51133 / 51149 | Accept's strings |
| ContainerMenu add entries of one inventory / one object | 51156 / 51157 | this read |
| ContainerMenu side filter per entry | 51171 (0x8feb30) | this read |
| ContainerMenu dirty-set membership | 51162 (0x8fe680) | this read |
| ContainerMode static | 405937 (0x31acdb8) | ContainerMenu.cpp:7 |
| ContainerMenu target handle static | 405962 (0x31ace80) | ContainerMenu.cpp:13 |
| player's RefHandle static (HYPOTHESIS; CommonLib labels it BarterMenu::GetTargetRefHandle, BarterMenu.cpp:7) | 403520 (0x31874f4) | 100+ gameplay readers, one writer 36629 |
| PlayerCharacter singleton | 403521 (0x31874f8) | Offsets.h:451 |
| take-all suppress byte read by 52849 | 406594 (0x31af788) | this read |
| ContainerMenu armor-changed byte | 405989 (0x31acf8c) | this read |
| take-all value threshold float | 382744 (0x2017460) | this read |
| RequestItemListUpdate(owner, obj) | 52849 (0x976a80) | Skyrim Souls RE Offsets.h, this read |
| message-data factory lookup by name | 35855 (0x61bba0) | this read |
| UIMessageQueue::AddMessage / CreateUIMessageData / ProcessCommands | 13631 / 82169 / 82167 | Offsets.h:569-571 |
| UIMessageQueue / InterfaceStrings / UI singletons | 400445 / 400446 / 400327 | Offsets.h:572, 328, 557 |
| UI::ProcessMessages (the dispatcher) | 82082 (0xfa3fa0) | Skyrim Souls RE Offsets.h |
| UI top-menu finder by depth | 82081 (0xfa3dc0) | this read |
| IMenu::ProcessMessage default | 82306 (0xfaed60) | this read |
| ItemList::Update_Impl | 51031 (0x8efb90) | Offsets.h:351 |
| ItemList::GetSelectedItem | 51017 (0x8ef4f0) | ItemList.cpp:7-26 |
| ItemList row ctor / clear rows / remove rows of one object | 50981 / 51014 / 50976 | this read |
| ItemList "InvalidateListData" | 51028 (0x8ef960) | this read |
| StandardItemData GetName / GetCount / GetEquipState / GetFilterFlag | 51803 / 51804 / 51805 / 51806 | VTABLE_StandardItemData 214924 |
| container-row test (flag & 0xFFC00) | 51820 (0x92a990) | this read |
| TESObjectREFR::RemoveItem / AddObjectToContainer | 19689 (0x2e1750) / 19708 (0x2e23d0) | VTABLE_TESObjectREFR 190259 slots 0x56 / 0x5A |
| Actor::RemoveItem / AddObjectToContainer | 37797 (0x692800) / 37525 (0x678f90) | VTABLE_Actor 207511 slots 0x56 / 0x5A |
| shared add implementation | 19687 (0x2e16d0) | this read |
| InventoryChanges::RemoveItem / AddItem (HYPOTHESIS names) | 16059 (0x228180) / 16053 (0x226a20) | this read |
| TESObjectREFR::GetInventoryChanges, no init / with init | 16039 (0x2259d0) / 16040 (0x2259f0) | this read |
| InventoryChanges::SendContainerChangedEvent | 16149 (0x239e20) | Offsets.h:339 |
| Papyrus ObjectReference.AddItem, base form / reference | 56489 (0xa3d6a0) / 56490 (0xa3d940) | the natives' error strings |
| Papyrus ObjectReference.RemoveItem / its helper | 56098 (0xa28e60) / 56647 (0xa44fe0) | the natives' error strings |
| drop path | 56626 (0xa447f0) | this read |
| CreateRefHandle / LookupReferenceByHandle | 12326 (0x179050) / 12332 (0x179710) | Offsets.h:580, 582 |
| null-handle static | 400312 (0x20f699c) | this read |
| Inventory3DManager singleton / begin / end | 403559 / 51754 / 51756 | Inventory3DManager.cpp:7 |
| TESObjectREFR::GetDisplayFullName | 19781 (0x2ea340) | Offsets.h:540 |
