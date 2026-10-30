# RE: the quest stage's fragment chain on 1.6.1170 (the re-analyst, 14:08 PDT 2026-10-29; for docs/verbs/quest-stage.md slice two)

Static read through Ghidra on the unpacked program, ids reverse-mapped from offsets with lab/addr.py's loader and forward-checked
with `just addr`; CommonLibSSE-NG declares the sink, the event and the source but no bodies. Every id is a HYPOTHESIS until the
Frida plan in the verb doc runs. The analyst's notes follow verbatim, then the reverse-mapping helper.

# quest-stage fragment chain, SkyrimSE 1.6.1170 (Ghidra program /SkyrimSE-1.6.1170.0.exe.unpacked.exe; the packed program decompiles to bad data)
Ids: 1.6.1170 offsets reverse-mapped with rev.py (lab/addr.py loader); forward-checked with just addr. Anchors: 25003 = Offset::TESQuest::EnsureQuestStarted (0x3c9bf0), 400476 = BGSStoryTeller::Singleton (0x20fba78), 14298 = ScriptEventSourceHolder::GetSingleton (0x1d5230), 53997 = topic-info sink (earlier read).
- 56688 0xa47340 Quest natives registrar; "SetCurrentStageID" string 0x141931cc0 -> callback 56684 0xa46fd0 stored at NativeFunction+0x50
- 56684 Quest.SetCurrentStageID(vm, stackId, quest, stage): refuse if !(flags&kEnabled) && eventID != -1; EnsureQuestStarted(startNow=0); running: 53703 (register latent wait) then 25004; needs start: 53711 queue; 53706 ProcessEvent(TESQuestStartStopEvent) -> 53713 -> 25004 later
- 25004 0x3c9d00 TESQuest stage setter (quest, u16): needs kEnabled; walks list at +0xE8; currentStage +0x228 raised only upward; 25252; AddChange(0x80000000)
- 25252 0x3da8f0 stage run (stage, quest, bool): done bit = flags bit0 (+2) unless set and !kAllowRepeatStages; kKeepInstance -> 0x3c93c0; startup/shutdown -> 32495 BGSStoryTeller::questStageWaitMap add; per item 25260
- 25260 0x3daea0 item run (item, bool): conditions (false -> ItemDone direct); data&1 complete 0x3c9570, data&2 fail 0x3c9310; hasLogEntry -> player journal add 0x737b80 + message 0x3d1b10; builds StageItemFinishedCallback (vtable 195903 0x17e6df0, 0x18 bytes: formID+0x10 stage+0x14 item+0x16); TESQuestStageEvent {cb, formID, stage, item} -> holder+0xA50 SendEvent 25271
- 53987 0x9c6b70 SkyrimVM::ProcessEvent(TESQuestStageEvent) = slot1 of VTABLE_SkyrimVM[30] 217115 0x19128a0; this = SkyrimVM+0xF0; lookup 53429 (fragmentSystem +0x478, lock +0x30) -> script, fragment names; found: GetObjectHandlePolicy1 (0x168) + GetHandle (0x20) + DispatchMethodCall2 (0x140) with wrapper functor (vtable 0x141912ce0, op() 54240 0x9d66a0 -> cb slot1) ; not found or dispatch fails -> cb slot1 inline; return 0
- 25234 0x3da060 StageItemFinishedCallback slot1: TESQuestStageItemDoneEvent {formID, stage, item} -> holder+0xAA8 (25272)
- ItemDone sinks: BGSStoryTeller 32480 -> 32498 (remove from questStageWaitMap); Papyrus registry DAT_1431afd70 53705 -> 53763 (per stage entry from 53716: item set + counter +0x50; at zero ReturnFromLatent slot 0x158 with bool true for each waiting stackId)
- console SetStage 22151 0x34e060 (CommandTable.h SCRIPT_FUNCTION +0x30): EnsureQuestStarted(startNow=1), stage finder 25028 0x3caa40, skips kStartUpStage if just started, 25004; "Stage %i not found"
- other 25004 caller: 23792 0x38ecd0 virtual (vtable near 0x1417dd330, unidentified)


## rev.py (the offset-to-id helper the read used)

```python
"""Reverse Address Library lookup: offsets (hex) -> ids, for 1.6.1170, via lab/addr.py's loader."""
import sys
from pathlib import Path
sys.path.insert(0, "lab")
import addr
db = addr.load_for_runtime(Path("addrlib"), "1.6.1170")
want = {int(a, 16) for a in sys.argv[1:]}
rev = {}
for i, off in enumerate(db.offsets):
    if off in want:
        rev.setdefault(off, []).append(db.ids[i])
for a in sys.argv[1:]:
    off = int(a, 16)
    print(f"0x{off:x} -> ids {rev.get(off, 'NONE')}")

```
