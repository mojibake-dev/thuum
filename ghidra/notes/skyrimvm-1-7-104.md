# SkyrimVM in 1.7.104: the VM implementation pointer moved to 0x210

Status: CONFIRMED statically at three sites (below); runtime confirmation is
Skyrim Platform loading on a 1.7.104 client (T1), pending the build.

Symptom: Skyrim Platform on 1.7.104 raised "Expected 'vm' to not to be
nullptr" (skyrim-platform.log, 2026-09-30). CommonLibSSE-NG (CharmedBaryon
b93280e8) resolves `SkyrimVM::GetSingleton()` through Address Library id
400475 (AE) and returns `vm->impl.get()` with `impl` declared at 0200 after
fifty `BSTEventSink` bases (include/RE/S/SkyrimVM.h).

Program: SkyrimSE-1.7.104.0.exe in the sky-re Ghidra project (auto-analysis
only, no CommonLib types). `just addr 400475` on 1.7.104 gives RVA 0x21a36e0
(image address 0x1421a36e0). `just ghidra-query SkyrimSE-1.7.104.0.exe xrefs
+0x21a36e0` lists one write (a 12-byte reset to 0) and many reads.

Evidence, decompiled with `just ghidra-query ... decompile <address>`:

| function | what it does with the singleton |
| --- | --- |
| FUN_1409cb800 | `*(singleton + 0x210)`, increments the count at +8 of the pointee, releases via vtable slot 0 with flag 1: a `BSTSmartPointer<BSIntrusiveRefCounted>` copy, i.e. `impl` |
| FUN_1409c94f0 | same pattern at +0x210 inside a loop over object type entries |
| FUN_1401e6640 | same pattern at +0x210 from another subsystem |

The 1.6 layout's raw pointers at 0208 (saveLoadInterface) and 0210
(debugInterface) are never ref-counted, so a ref-counted object at 0x210 is
`impl` shifted by 0x10: two `BSTEventSink` bases were added ahead of the
members. Which events they sink is not identified; nothing in the fork needs
them.

Fix: overlay patch 07 on the fork's CommonLib port adds
`SkyrimVM::GetImpl()`, which returns the smart pointer at 0x210 when the
running game is 1.7.x and at 0x200 otherwise; `VirtualMachine::GetSingleton`
and Skyrim Platform's two `impl` uses go through it. Members after `impl`
(saveLoadInterface, debugInterface, memoryPagePolicy, scriptLoader, logger,
...) shift by the same 0x10 and stay UNPATCHED until something needs them.
