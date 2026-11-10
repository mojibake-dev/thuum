# rotfern's eyes (thuum D-E1)

Eli's ask (2026-11-09): rotfern's eyes follow her race and Dragonborn's main quest. They default to her usual eyes, and take
the vampire variant while she is a vampire. Once she "kills Miraak and becomes hermaeus moras champion", they become the Mora
eyes, in the vampire variant if she is a vampire. D-E1 A (docs/DECISIONS.md, main 8e06196e) builds it the single-player way:
a companion plugin whose own script sets the eyes. rung 5 then carries that script's Actor.ChangeHeadPart to the server as an
own-player row, so the other seat sees the change and the server's record keeps it.

All four eye head parts and both races are already in rotfern.esp, which this folder only reads:

| head part | form id in rotfern.esp | mesh | texture set | valid race |
| --- | --- | --- | --- | --- |
| RotfernEyes | 0x014C06 | EyesFemale.nif | EyesRotfernAlbino | rotfern 0xAA00 |
| RotfernEyesVampire | 0x019D09 | rotfernVampire.nif | EyesRotfernAlbino | rotfernRaceVampire 0x19D08 |
| RotfernEyesMora | 0x023F0E | EyesFemale.nif | EyesRotfernMoraAlbino | rotfern 0xAA00 |
| RotfernEyesMoraVampire | 0x023F0F | rotfernVampire.nif | EyesRotfernMoraAlbino | rotfernRaceVampire 0x19D08 |

The race lists are rotfern.esp's FLSTs RotfernEyesRaces (0x2E120) and RotfernEyesVampireRaces (0x2E121). A race switch drops
an eye part that is not valid for the new race to that race's default. rotfernRaceVampire also carries the "Overlay Head
Part List" flag (0x54A08943, bit 26), so its default parts are laid over her own as overlays. Its female defaults are
RotfernChildHead, RotfernChildMouth and RotfernEyesMoraVampire, while its male defaults end in RotfernEyesVampire. So a
vampire rotfern likely shows the Mora vampire eyes before the questline, with or without this plugin, and a script cannot
correct an overlay that comes from the race. That is read from the plugin; the runtime effect is a HYPOTHESIS until a turn
is traced (thuum-fa's review of 7677106e, note 2). Changing that default is rotfern.esp's change, Eli's call. Hence the
script for the Mora switch, and an open question for the vampire half.

## What is here

- `src/RotfernEyesAlias.psc`: the script, on a player alias. At OnInit, OnPlayerLoadGame, OnRaceSwitchComplete and
  OnLocationChange it computes eyes = f(race, DLC2MQ06.IsCompleted()). It calls Actor.ChangeHeadPart only when the player's
  eyes differ, and does nothing for any race but rotfern's two. No vanilla quest is edited: the questline ends in Apocrypha,
  so the next location change applies the Mora eyes. Its seven properties are the parts and forms it may set or read, which
  is the bound rung 5's row checks. It reads the eyes from her base list only. If a traced turn shows ChangeHeadPart moving
  the overlay, the check reads the overlay first (GetIndexOfOverlayHeadPartByType and GetNthOverlayHeadPart).
- `build_esp.py`: writes RotfernEyes.esp byte by byte, the same bytes every run. It is a light plugin with masters
  Skyrim.esm, Dragonborn.esm and rotfern.esp, and one start-game-enabled quest, RotfernEyesQuest (0x800). The quest's alias 0
  is the player by forced reference PlayerRef 0x14 (ALFR). Every start-game-enabled player-alias quest in the load order fills
  that way, and rung 5's alias half marks it per player. The script and its properties are in
  the quest's VMAD. The layout follows UESP's QUST and VMAD pages and two quests the game loads: RaceMenuMorphsCBBE.esp's
  alias script, and DLC2MQ06's own properties for the object encoding. lab/tests/test_rotfern_eyes.py reads it back field by
  field, and checks that the script declares exactly the plugin's properties.

## What comes next

- **The compile:** a CI job on sky-build compiles the script with the Creation Kit's PapyrusCompiler.exe. The inputs are the
  vanilla Scripts.zip and SKSE's script sources. They are licensed and third-party, placed on the runner by core and never
  put in this repo. Caprica is the fallback. The Linux half writes the plugin, and the artifact holds RotfernEyes.esp and
  Scripts/RotfernEyesAlias.pex. The inputs are unpacked outside the checkout and removed on every path out, a cancelled job by
  its after_script; nothing licensed reaches an artifact.
- **The layer:** a `ci` row names that job, as Rotfern's Fixes does (ADR-069). The plugin gets one light, served line in
  load-order.tsv after every served plugin, so no existing index moves. The server must load it too, or quest_scope never
  sees the quest.
- **The proof (T3):** the swap is seen on the other seat and kept across a relaunch, once rung 5's ChangeHeadPart row is in.
