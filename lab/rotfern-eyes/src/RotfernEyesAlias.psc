ScriptName RotfernEyesAlias extends ReferenceAlias
{rotfern's eyes follow her race and Dragonborn's main quest (thuum D-E1, Eli 2026-11-09: "After she kills Miraak and becomes
hermaeus moras champion is when she gets the eyes"). Her usual eyes, or the Mora eyes once DLC2MQ06 is completed, each in its
vampire variant while her race is rotfern's vampire race. The alias is the player (forced reference PlayerRef), so every seat
runs this for its own player; for any race but rotfern's two it does nothing. The four eye head parts and both races live in
rotfern.esp, which this plugin only reads. Each change writes "RotfernEyesAlias: <event>: eyes set to <part>" to the Papyrus
log, for a person reading Papyrus.0.log with [Papyrus] bEnableLogging and bEnableTrace on; the lab neither enables nor
collects that log, so the T3 claims rung 5's server line for the ChangeHeadPart row instead.}

Race Property RotfernRace Auto
{rotfern.esp 0xAA00: the usual eyes and the Mora eyes are valid for it (FLST RotfernEyesRaces)}
Race Property RotfernRaceVampire Auto
{rotfern.esp 0x19D08: the two vampire variants are valid for it (FLST RotfernEyesVampireRaces)}
HeadPart Property RotfernEyes Auto
{rotfern.esp 0x014C06}
HeadPart Property RotfernEyesVampire Auto
{rotfern.esp 0x019D09}
HeadPart Property RotfernEyesMora Auto
{rotfern.esp 0x023F0E}
HeadPart Property RotfernEyesMoraVampire Auto
{rotfern.esp 0x023F0F}
Quest Property DLC2MQ06 Auto
{Dragonborn.esm 0x0179D7, "At the Summit of Apocrypha": stage 550, its one Complete Quest entry, is Miraak's death}

Event OnInit()
	UpdateEyes("OnInit")
EndEvent

Event OnPlayerLoadGame()
	UpdateEyes("OnPlayerLoadGame")
EndEvent

Event OnRaceSwitchComplete()
	; a vampire's turn or cure: the engine's race switch drops eyes not valid for the new race to its default, so set them
	UpdateEyes("OnRaceSwitchComplete")
EndEvent

Event OnLocationChange(Location akOldLoc, Location akNewLoc)
	; the questline ends inside Apocrypha, so the next change of location after it applies the Mora eyes
	UpdateEyes("OnLocationChange")
EndEvent

Function UpdateEyes(String why)
	Actor player = GetActorReference()
	If !player
		Return
	EndIf
	Race current = player.GetRace()
	Bool vampire
	If current == RotfernRace
		vampire = False
	ElseIf current == RotfernRaceVampire
		vampire = True
	Else
		Return
	EndIf
	Bool mora = DLC2MQ06 && DLC2MQ06.IsCompleted()
	HeadPart want
	If mora && vampire
		want = RotfernEyesMoraVampire
	ElseIf mora
		want = RotfernEyesMora
	ElseIf vampire
		want = RotfernEyesVampire
	Else
		want = RotfernEyes
	EndIf
	If !want
		Return
	EndIf
	; the player's own eyes, head part type 2 (SKSE's ActorBase.GetIndexOfHeadPartByType)
	ActorBase base = player.GetActorBase()
	Int slot = base.GetIndexOfHeadPartByType(2)
	If slot >= 0 && base.GetNthHeadPart(slot) == want
		Return
	EndIf
	player.ChangeHeadPart(want)
	Debug.Trace("RotfernEyesAlias: " + why + ": eyes set to " + want.GetPartName())
EndFunction
