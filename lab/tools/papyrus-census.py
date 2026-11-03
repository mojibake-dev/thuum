#!/usr/bin/env python3
"""A static census of the Papyrus natives the load order's scripts name (thuum ADR-062, 2026-11-02).
Reads every .pex in the game's and the mods' archives and the mods' loose scripts, by its string table, and
counts the scripts naming each state-changing native. Runs on sky-srv, where the archives are."""
import glob, importlib.util, os, struct, sys, collections
spec = importlib.util.spec_from_file_location("bsa", "/srv/lab/thuum/lab/tools/bsa-extract.py")
bsa = importlib.util.module_from_spec(spec); spec.loader.exec_module(bsa)

NATIVES = {
 "inventory": ["AddItem","RemoveItem","RemoveAllItems","DropObject","EquipItem","UnequipItem","EquipSpell","AddSpell","RemoveSpell","AddShout","RemoveShout","AddPerk","RemovePerk","SetOutfit"],
 "life": ["Kill","KillSilent","KillEssential","Resurrect","SetEssential","SetProtected","SetGhost","SetUnconscious","SetRestrained","SetCriticalStage","SetAlpha"],
 "values": ["SetActorValue","SetAV","ModActorValue","ModAV","DamageActorValue","DamageAV","RestoreActorValue","RestoreAV","ForceActorValue","ForceAV","SetRace"],
 "ai": ["SetDontMove","SetAlert","StartCombat","StopCombat","SendAssaultAlarm","SendTrespassAlarm","SetAttackActorOnSight","EvaluatePackage","PathToReference","SetPlayerTeammate","SetRelationshipRank","AddToFaction","RemoveFromFaction","SetFactionRank","SetCrimeFaction","SetLookAt","ClearLookAt","SetHeadTracking","PushActorAway","StartSneaking","DrawWeapon","SheatheWeapon","Dismount","KeepOffsetFromActor","ClearKeepOffsetFromActor"],
 "placement": ["Enable","Disable","EnableNoWait","DisableNoWait","Delete","DeleteWhenAble","PlaceAtMe","PlaceActorAtMe","MoveTo","MoveToMyEditorLocation","MoveToNode","MoveToInteractionLocation","SetPosition","SetAngle","TranslateTo","TranslateToRef","SplineTranslateTo","SplineTranslateToRef","StopTranslation","SetScale","SetMotionType","ApplyHavokImpulse","Reset","EnableLinkChain","DisableLinkChain"],
 "object-state": ["Lock","SetLockLevel","SetOpen","Activate","BlockActivation","PlayAnimation","PlayAnimationAndWait","PlayGamebryoAnimation","PlaySyncedAnimationSS","PlaySyncedAnimationAndWaitSS","PlayImpactEffect","SetDestroyed","DamageObject","ClearDestruction","SetActorOwner","SetFactionOwner","SetNoFavorAllowed","SetDisplayName","SetHarvested","SetAnimationVariableBool","SetAnimationVariableFloat","SetAnimationVariableInt","SendAnimationEvent","AddDependentAnimatedObjectReference"],
 "quest": ["SetStage","SetCurrentStageID","Start","Stop","CompleteQuest","CompleteAllObjectives","SetObjectiveCompleted","SetObjectiveDisplayed","SetObjectiveFailed","SetActive","ForceRefTo","ForceRefIfEmpty","ForceLocationTo","Clear","ForceStart","UpdateCurrentInstanceGlobal"],
 "globals-game": ["SetValue","SetValueInt","AdvanceSkill","IncrementSkill","IncrementSkillBy","AddPerkPoints","SetPlayerLevel","TeachWord","UnlockWord","AddAchievement","IncrementStat","SetGameSettingFloat","SetGameSettingInt","SetGameSettingString","SetGameSettingBool","EnablePlayerControls","DisablePlayerControls","SetPlayerAIDriven","SetInChargen","FastTravel","SetBeastForm","ShowRaceMenu","ForceFirstPerson","ForceThirdPerson","ShakeCamera","TriggerScreenBlood","FadeOutGame","SetCameraTarget","SetHudCartMode","RequestAutoSave","RequestSave","ServeTime","SendWereWolfTransformation","SetSunGazeImageSpaceModifier","StartTitleSequence"],
 "magic-weather": ["Cast","RemoteCast","Dispel","DispelAllSpells","DispelSpell","DoCombatSpellApply","ForceActive","ReleaseOverride","SetActive","ForceWeather","SetWeather","Play","Stop"],
}
NAMES = {n.lower(): (g, n) for g, ns in NATIVES.items() for n in ns}

def strings_of(data):
    # UESP "Compiled Script File Format": magic, major, minor, game, time, source, user, machine, then the string table
    if len(data) < 16 or struct.unpack_from(">I", data, 0)[0] != 0xFA57C0DE:
        return None, None
    pos = 4 + 1 + 1 + 2 + 8
    names = []
    for _ in range(3):
        ln = struct.unpack_from(">H", data, pos)[0]; pos += 2
        names.append(data[pos:pos+ln].decode("latin-1", "replace")); pos += ln
    count = struct.unpack_from(">H", data, pos)[0]; pos += 2
    out = []
    for _ in range(count):
        ln = struct.unpack_from(">H", data, pos)[0]; pos += 2
        out.append(data[pos:pos+ln].decode("latin-1", "replace")); pos += ln
    return names[0], out

per_native = collections.defaultdict(lambda: {"vanilla": set(), "mods": set()})
totals = {"vanilla": 0, "mods": 0}
sources = []
def take(kind, script, source):
    name, strs = strings_of(script)
    if strs is None:
        return
    totals[kind] += 1
    low = {s.lower() for s in strs}
    for key, (g, n) in NAMES.items():
        if key in low:
            per_native[(g, n)][kind].add(source)

def scan_bsa(path, kind):
    buf = open(path, "rb").read()
    table, aflags, ver = bsa.entries(buf)
    pex = [p for p in table if p.endswith(".pex")]
    n = 0
    for p in pex:
        try:
            data = bsa.extract(buf, p)
        except Exception as e:
            print(f"# {os.path.basename(path)}: {p}: {e}", file=sys.stderr); continue
        take(kind, data, os.path.basename(p)[:-4]); n += 1
    sources.append((kind, os.path.basename(path), n))

for path in sorted(glob.glob("/srv/persist/game/1.6.1170/depot_*/Data/*.bsa")):
    if any(k in path for k in ("Texture", "Meshes", "Voices", "Sounds", "Animations", "Shaders", "Interface", "Marketplace")):
        continue
    scan_bsa(path, "vanilla")
for path in sorted(glob.glob("/srv/persist/mods/*/*.bsa") + glob.glob("/srv/persist/mods/*/*/*.bsa")):
    if "Texture" in path or "texture" in path:
        continue
    scan_bsa(path, "mods")
loose = 0
for path in glob.glob("/srv/persist/mods/**/*.pex", recursive=True):
    take("mods", open(path, "rb").read(), os.path.basename(path)[:-4]); loose += 1
sources.append(("mods", "loose .pex", loose))

print("# sources: " + "; ".join(f"{k}:{n}({c} pex)" for k, n, c in sources if c))
print(f"# scripts read: vanilla {totals['vanilla']}, mods {totals['mods']}")
print("group\tnative\tvanilla_scripts\tmod_scripts\texamples")
for (g, n) in sorted(per_native, key=lambda k: (k[0], -len(per_native[k]["vanilla"]) - len(per_native[k]["mods"]))):
    v = per_native[(g, n)]["vanilla"]; m = per_native[(g, n)]["mods"]
    ex = ", ".join(sorted(v)[:4] + sorted(m)[:3])
    print(f"{g}\t{n}\t{len(v)}\t{len(m)}\t{ex}")
