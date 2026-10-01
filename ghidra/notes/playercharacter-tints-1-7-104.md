# PlayerCharacter's tint list in 1.7.104: the array moved 8 bytes down

Status: CONFIRMED statically for the array (two engine functions below) and
dynamically for the crash it causes; the overlay pointer's new offset is a
HYPOTHESIS (the +8 shift carried forward) until a run shows tints applying.

Symptom: with an appearance on the player, SkyrimSE.exe 1.7.104 dies about
4 s after SKSE's PostLoadGame with status 0xC0000005 and no dump (sky-c1,
2026-10-01, 4 of 4). Frida's first-chance handler (lab/frida/exit-trace.js,
run 11:50:38): read of address 0x32, pc SkyrimPlatformImpl.dll+0x1b3046,
rax 0x22, called through the Papyrus VM (SkyrimSE.exe+0x14a9e15 frames) from
a TESModPlatform native. 0x22 is 34, the character's tint count.

Pinned CommonLib (CharmedBaryon b93280e8, src/RE/P/PlayerCharacter.cpp
GetTintList): the overlay tint-list pointer at this+0xB30 for 1.6.629 and
newer (0xB28 before), the tint array at 0xB18 (0xB10 before). In 1.7.104 the
count sits at 0xB30, so GetTintList took the count for a pointer and the
next read (BSTArray size at +0x10 of 0x22) faulted at 0x32.

Program: SkyrimSE-1.7.104.0.exe in the sky-re Ghidra project. Address Library
AE ids (CommonLib include/RE/Offsets.h): PlayerCharacter::GetNumTints 40700,
GetTintMask 40698; `python3 lab/addr.py addrlib 1.7.104 <id>` gives RVAs
0x75d060 and 0x75ceb0. `just ghidra-query SkyrimSE-1.7.104.0.exe decompile
+0x75d060` and `+0x75ceb0`:

| function | reads |
| --- | --- |
| FUN_14075d060 (GetNumTints) | count `*(uint*)(this+0xb30)`, data `*(longlong**)(this+0xb20)`, each entry's type at +0x10 |
| FUN_14075ceb0 (GetTintMask) | the same two fields, same entry layout |

So in 1.7.104 `BSTArray<TintMask*> tintMasks` is at 0xB20 (data 0xB20,
capacity 0xB28, size 0xB30): 8 bytes further than 1.6.1170's 0xB18. The
overlay pointer followed the array directly in every known layout, so it is
taken to be at 0xB38. The TintMask entry layout (type at +0x10) is unchanged.

Fix: overlay patch 08 on the fork's CommonLib port (skymp/overlay_ports/
commonlibsse-ng-flatrim/patches/08-playercharacter-tints-1-7.patch):
GetTintList and GetOverlayTintMask pick 0xB20/0xB38 on 1.7.x. Other
PLAYER_RUNTIME_DATA members after the insertion point may have moved too;
not yet checked (nothing the client uses crashed on them so far).

## The NPC record itself did not move

The same check on TESNPC, the other structure the appearance path writes
(AE ids from CommonLib include/RE/Offsets.h, resolved with lab/addr.py for
1.7.104, decompiled with `just ghidra-query SkyrimSE-1.7.104.0.exe decompile`):

| function | reads | pinned header |
| --- | --- | --- |
| FUN_1403c5bd0 ChangeHeadPart (24750, +0x3c5bd0) | headParts `this+0x238`, numHeadParts `this+0x240` | TESNPC.h: 238, 240 |
| FUN_1403c8c00 HasOverlays (24790, +0x3c8c00) | race `this+0x158`, `this+0x1e8`; player singleton `+0xb48` | TESRaceForm at 150, race at 158 |
| FUN_1403c8d90 GetNumBaseOverlays (24792) | a hash map keyed by the NPC, no NPC fields | n/a |
| FUN_1403c0080 UpdateNeck (24711) | `this+0x1fc` (a float) | n/a |

So SetNpcSex, SetNpcRace, SetNpcSkinColor, ResizeHeadpartsArray and the
head-part writes land where the headers say; only PlayerCharacter moved.
HasOverlays comparing the NPC's race with `player+0xB48` fits the same +8
shift (RACE_DATA follows the overlay pointer).

