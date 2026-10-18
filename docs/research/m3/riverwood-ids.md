# Riverwood's townsfolk by placed reference (2026-10-18)

Form ids read from Skyrim.esm on sky-srv with lab/esm.py's record walk
(UESP, "Skyrim Mod:Mod File Format", for the group types: 6 cell children,
1 world children), read-only over the host jump; names and ids only, as a
form id is data, not a licensed file. The lab driver's `watch-start
{formIds: [...]}` (thuum branch m3-driver-recorder) resolves a placed actor
by this id with Game.getFormEx and Actor.from; a base NPC_ id would not do.

Every named resident is a persistent ACHR placed in its home interior, not
in an exterior grid cell: the morning package walks it outside. So a
reference naming them watches actors that may be indoors at watch-start
(a persistent reference resolves from anywhere; its position reads while
its cell is loaded), and r-npc-packages' clock step is what brings them out.

| actor | placed ACHR | base NPC_ | home cell |
| --- | --- | --- | --- |
| Alvor | 0x13482 (78978) | Alvor 0x13475 | RiverwoodAlvorsHouse 0x133C8 |
| Sigrid | 0x13483 (78979) | Sigrid 0x13476 | RiverwoodAlvorsHouse |
| Dorthe | 0x13484 (78980) | Dorthe 0x13477 | RiverwoodAlvorsHouse |
| Gerdur | 0x13489 (78985) | Gerdur 0x1347C | RiverwoodGerdursHouse 0x133C7 |
| Hod | 0x1348A (78986) | Hod 0x1347D | RiverwoodGerdursHouse |
| Frodnar | 0x1348B (78987) | Frodnar 0x1347E | RiverwoodGerdursHouse |
| Faendal | 0x1348C (78988) | Faendal 0x13480 | RiverwoodFaendalsHouse 0x133CA |
| Sven | 0x13491 (78993) | Sven 0x1347F | RiverwoodSvensHouse 0x1CB84 |
| Hilde | 0x35534 (218420) | Hilde 0x35533 | RiverwoodSvensHouse |
| Camilla Valerius | 0x13488 (78984) | CamillaValerius 0x1347B | RiverwoodRiverwoodTrader 0x133C9 |
| Lucan Valerius | 0x13487 (78983) | LucanValerius 0x1347A | RiverwoodRiverwoodTrader |
| Orgnar | 0x13486 (78982) | Orgnar 0x13479 | RiverwoodSleepingGiantInn 0x133C6 |
| Delphine | 0x13485 (78981) | Delphine 0x13478 | RiverwoodSleepingGiantInn |
| Embry | 0x3550C (218380) | Embry 0x3550B | RiverwoodSleepingGiantInn |

Ralof has no placed reference in Riverwood; his one ACHR (0x2BF9E) sits far
above the village (z about 8450 against 0 to 240 here, likely Helgen's), so
no Riverwood reference names him.

Exterior cells (worldspace Tamriel 0x3C), by grid: Riverwood 0x9732 (4,-12),
Riverwood01 0x9713 (4,-11), Riverwood02 0x9712 (5,-11), Riverwood03 0x9711
(6,-11), Riverwood04 0x9731 (5,-12), Riverwood05 0x9730 (6,-12), Riverwood06
0x9752 (3,-13), RiverwoodPath 0x96D4 (5,-9), RiverwoodBridge 0x96F3 (5,-10),
RiverwoodEdge01 0x9733 (3,-12). The Sleeping Giant Inn's interior is
0x133C6 (78790).
