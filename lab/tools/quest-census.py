#!/usr/bin/env python3
"""quest-census.py: which quests are a player's own, over the deployed load order (thuum ADR-068 rung 5,
docs/research/rung5-quests-2026-11-09.md 1(e), section 7's finding 5 and 8(a)'s D-Q1 classification). Runs on sky-srv
over lab/census.py's index; prints derived facts only (ids, editor ids, script, property and native names, counts).

The rule (8(a), the server's quest_scope.rs keeps the alias half; this tool derives the list half):
- **The alias half.** A quest with aliases is the player's when every alias is a reference alias that is the
  player's: forced to the player's reference (ALFR 0x14), the player's unique actor (ALUA, the NPC_ 0x7 Player), an
  object created in such an alias (ALCO with ALCA's "in"), or an external alias (ALEQ and ALEA) that is the player's.
  A location alias, any other fill, or no fill at all makes the quest the world's.
- **The list half** (the deploy settings' `playerQuests`). A quest with no alias is the player's when its scripts (its
  VMAD's live scripts and their parents with code, the QF fragment script among them) make at least one call that
  changes a reference's or an actor's state, and every such call is aimed at the player: Game.GetPlayer(), a property
  whose value on that quest is the player's reference (or a player alias), an object variable every write of which is
  one of those, or a function parameter every vanilla or layer call site passes one of those to (followed to a depth
  of four). A Game static that acts on the player by itself (SetBeastForm, AdvanceSkill, IncrementStat ...) counts as
  aimed at the player. The calls counted are lab/tools/papyrus-census.py's inventory, life, values, ai, placement and
  object-state natives on a reference, an actor or an actor base, and a spell's Cast or RemoteCast (aimed at its
  target, else its source); the quest's own stage and objective calls, other quests' calls and GlobalVariable writes
  are reported, never counted, and so is a call on a reference the same function placed (a PlaceAtMe or
  PlaceActorAtMe result: made here, held by no other seat; this tool's reading beside 8(a)'s words, for Eli's review).
- Per quest either half marks, the GLOBs its scripts write (GlobalVariable SetValue, SetValueInt and Mod, and a Value
  property set, on a property whose value is a GLOB), which the server composes into playerGlobals; the condition keys
  that name it (lab/census.py's condition_keys: the 629 conditions reading its variables), which move to the player's
  own record (D-T2); its scripts' scalar variables (D-T2 B's own entries); and the call sites outside its scripts that
  call into them (read 18's callers, PQ-3).
- The settings the fork's PartOne::SetPlayerQuestSettings reads (m4-scripts-5-server 0390e5cc), each an object keyed by
  the marked quest's or the world quest's FormDesc, "<hex id>:<plugin>": playerQuestGlobals, the quest's GLOBs as
  FormDescs; playerQuestVariables, its scalar variables as "<script>::<var>" (split at the first "::": the attached
  script whose chain declares the variable, as conditionVariables names it, then the variable as compiled, an auto
  property's "::<name>_var"; the quest's own scripts before its QF fragment script, whose first entry's script keys the
  quest's game-time registration there); and playerQuestCallers, PQ-3's list: per world quest (no marked quest among
  them) the stages whose QF fragment calls into a marked quest's scripts, directly or through the calls it makes, to a
  depth of four (VC01's stage whose Fragment_4 calls VampireCure). A call counts when its receiver's type is the marked
  quest's attached script or extends it, never a base it shares with world quests; a caller that is no quest's stage
  fragment (a scene's, a perk's, an alias's, a magic effect's) is reported in the evidence, a declared limit (8(a)).

    quest-census.py                   finding 5's sizes over the quest and trigger scripts, then the classification
    quest-census.py --show <id> ...   one quest's aliases, scripts and each counted call's subject (an id as 0xeafd5, or
                                      a FormDesc "eafd5:Skyrim.esm")
    quest-census.py --emit            JSON: the settings' playerQuests, playerQuestGlobals, playerQuestVariables and
                                      playerQuestCallers, and the census's evidence

lab/census.py's arguments (--settings, --esm, --mods, --game, --version, --cache) name the load order.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import census as C  # noqa: E402

# lab/tools/papyrus-census.py's groups of state natives on a reference, an actor or an actor base, lowercased
REF_NATIVES = {n.lower() for n in (
    "AddItem RemoveItem RemoveAllItems DropObject EquipItem UnequipItem EquipSpell AddSpell RemoveSpell AddShout "
    "RemoveShout AddPerk RemovePerk SetOutfit Kill KillSilent KillEssential Resurrect SetEssential SetProtected SetGhost "
    "SetUnconscious SetRestrained SetCriticalStage SetAlpha SetActorValue SetAV ModActorValue ModAV DamageActorValue "
    "DamageAV RestoreActorValue RestoreAV ForceActorValue ForceAV SetRace SetDontMove SetAlert StartCombat StopCombat "
    "SendAssaultAlarm SendTrespassAlarm SetAttackActorOnSight EvaluatePackage PathToReference SetPlayerTeammate "
    "SetRelationshipRank AddToFaction RemoveFromFaction SetFactionRank SetCrimeFaction SetLookAt ClearLookAt "
    "SetHeadTracking PushActorAway StartSneaking DrawWeapon SheatheWeapon Dismount KeepOffsetFromActor "
    "ClearKeepOffsetFromActor Enable Disable EnableNoWait DisableNoWait Delete DeleteWhenAble PlaceAtMe PlaceActorAtMe "
    "MoveTo MoveToMyEditorLocation MoveToNode MoveToInteractionLocation SetPosition SetAngle TranslateTo TranslateToRef "
    "SplineTranslateTo SplineTranslateToRef StopTranslation SetScale SetMotionType ApplyHavokImpulse EnableLinkChain "
    "DisableLinkChain Lock SetLockLevel SetOpen Activate BlockActivation PlayAnimation PlayAnimationAndWait "
    "PlayGamebryoAnimation SetDestroyed DamageObject ClearDestruction SetActorOwner SetFactionOwner SetNoFavorAllowed "
    "SetDisplayName SetHarvested SetAnimationVariableBool SetAnimationVariableFloat SetAnimationVariableInt "
    "SendAnimationEvent DispelAllSpells DispelSpell DoCombatSpellApply SetVehicle").split()}
SPELL_CASTS = {"cast", "remotecast"}
GLOBAL_WRITES = {"setvalue", "setvalueint", "mod"}  # GlobalVariable's writes (its Value property's set is the fourth)
QUEST_NATIVES = {n.lower() for n in (
    "SetStage SetCurrentStageID Start Stop CompleteQuest CompleteAllObjectives SetObjectiveCompleted SetObjectiveDisplayed "
    "SetObjectiveFailed SetActive ForceStart Reset UpdateCurrentInstanceGlobal").split()}
# Game statics that act on the player with no subject named (the old census's list)
IMPLICIT = {"setbeastform", "sendwerewolftransformation", "disableplayercontrols", "enableplayercontrols",
            "incrementstat", "setplayeraidriven", "forcethirdperson", "forcefirstperson", "showracemenu",
            "addperkpoints", "setinchargen", "teachword", "unlockword", "advanceskill", "incrementskill",
            "incrementskillby", "setplayerlevel", "setplayerreporttrespass", "setplayerreportcrime"}
# a value read off the player's reference that still names the player (or its base)
ACCESSORS = {"getreference()", "getactorreference()", "getref()", "getactorref()", "getactorbase()", "getleveledactorbase()"}
MAX_DEPTH = 4


def parse_form(text: str, lo=None) -> str:
    """A quest named on the command line or in the settings as an identity: a FormDesc "eafd5:Skyrim.esm", or a runtime id
    "0xeafd5" resolved through the load order's slots (0x020071d0 is Dawnguard.esm's 0x71d0 in the lab's order)."""
    if ":" in text:
        local, plugin = text.split(":", 1)
        return C.key(plugin, int(local, 16))
    v = int(text, 0)
    found = lo.ident(v) if lo is not None else None
    return found if found is not None else C.key("skyrim.esm", v)


class World:
    """The index's facts with the resolvers the rule needs."""

    def __init__(self, lo, R, X):
        self.lo, self.R, self.X = lo, R, X
        self.aliases = {(q, a["id"]): a for q, rec in R["quests"].items() for a in rec["aliases"]}
        # each script's attachments: (owner kind, owner, alias pair or None, {property: value})
        self.attach = collections.defaultdict(list)
        for q, rec in R["quests"].items():
            vm = rec.get("vmad") or {}
            for s in C.live_scripts(vm):
                self.attach[s["name"].lower()].append(("QUST", q, None, self._props(s)))
            for al in vm.get("aliases", []):
                for s in C.live_scripts(al):
                    self.attach[s["name"].lower()].append(("alias", q, (al.get("quest") or q, al["alias"]), self._props(s)))
        for src in ("vmads", "infos", "scenes"):
            for g, rec in R[src].items():
                for s in C.live_scripts(rec.get("vmad")):
                    self.attach[s["name"].lower()].append((rec.get("type") or src[:-1].upper(), g, None, self._props(s)))
        # each quest's stage fragments: (fragment script, fragment function) -> [(quest, stage)] (QUST VMAD's fragment section)
        self.fragments = collections.defaultdict(list)
        for q, rec in R["quests"].items():
            vm = rec.get("vmad") or {}
            for stage, log, script, fragment in vm.get("frags", []):
                self.fragments[((script or vm.get("file") or "").lower(), fragment.lower())].append((q, stage))
        self.sites = collections.defaultdict(list)  # method -> [(script, function key, receiver type, receiver tag, args)]
        for x, sc in X.items():
            for fk, f in sc["fn"].items():
                for meth, rt, rtag, args in f["calls"]:
                    self.sites[meth].append((x, fk, rt, rtag, args))

    @staticmethod
    def _props(s: dict) -> dict:
        return {p.lower(): v for p, t, v in s["props"]}

    def is_type(self, rt: str, base: str) -> bool:
        return rt == base or (rt in self.X and base in C.chain(self.X, rt))

    def alias_is_player(self, quest: str, alias: int, seen: frozenset = frozenset()) -> bool:
        a = self.aliases.get((quest, alias))
        if a is None or a["kind"] != "ALST" or (quest, alias) in seen:
            return False
        seen = seen | {(quest, alias)}
        fill = a["fill"]
        if fill.get("ALFR") == C.PLAYER_REF or fill.get("ALUA") == C.PLAYER_BASE:
            return True
        if fill.get("ALCO") and "ALCA" in fill:
            at, inside = C.alca(fill["ALCA"])
            if inside and self.alias_is_player(quest, at, seen):
                return True
        if fill.get("ALEQ") and "ALEA" in fill:
            return self.alias_is_player(fill["ALEQ"], fill["ALEA"], seen)
        return False

    def value_is_player(self, v) -> bool:
        """A property's VMAD value names the player: its reference or base, or an alias that is the player's."""
        if not (isinstance(v, list) and len(v) == 2 and not isinstance(v[0], list)):
            return False
        form, alias = v
        if isinstance(alias, int) and alias >= 0:
            return bool(form) and self.alias_is_player(form, alias)
        return form in (C.PLAYER_REF, C.PLAYER_BASE)

    def contexts(self, script: str) -> list[tuple[dict, tuple | None]]:
        """The script's attachments as (property values, its alias): every one must agree for a tag to name the player."""
        return [(props, alias) for kind, owner, alias, props in self.attach.get(script, [])]

    def tag_is_player(self, tag: str, script: str, fkey: str, ctx: list, depth: int = 0, seen: frozenset = frozenset()) -> bool:
        base, _, rest = tag.partition(".")
        if rest and rest not in ACCESSORS:
            return False
        if base == "getplayer":
            return True
        if base == "self":
            return bool(ctx) and all(alias is not None and self.alias_is_player(*alias) for props, alias in ctx)
        if base.startswith("prop:"):
            return bool(ctx) and all(self.value_is_player(props.get(base[5:])) for props, alias in ctx)
        if depth >= MAX_DEPTH:
            return False
        if base.startswith("param:"):
            return self.param_is_player(script, fkey, base[6:], depth + 1, seen)
        if base.startswith("var:"):
            var = base[4:]
            writes = [(d, fk, t) for d in C.chain(self.X, script) if d in self.X for fk, f in self.X[d]["fn"].items()
                      for t in f["vw"].get(var, []) if t != "None"]
            return bool(writes) and all(self.tag_is_player(t, d, fk, ctx, depth + 1, seen) for d, fk, t in writes)
        return False

    def callers(self, script: str, fname: str) -> list[tuple]:
        """The call sites that reach a function of the script: a call on a receiver of its family, or a parent call
        from a child of it."""
        out = []
        for x, fk, rt, rtag, args in self.sites.get(fname, []):
            if rt == "parent":
                if script in C.chain(self.X, x)[1:]:
                    out.append((x, fk, rt, rtag, args))
            elif rt in self.X and script in C.chain(self.X, rt):
                out.append((x, fk, rt, rtag, args))
        return out

    def param_is_player(self, script: str, fkey: str, pname: str, depth: int, seen: frozenset) -> bool:
        if (script, fkey, pname) in seen or fkey not in self.X.get(script, {}).get("fn", {}):
            return False
        seen = seen | {(script, fkey, pname)}
        params = self.X[script]["fn"][fkey]["params"]
        if pname not in params:
            return False
        idx = params.index(pname)
        sites = self.callers(script, fkey.split(".", 1)[1])
        if not sites:
            return False
        for x, fk, rt, rtag, args in sites:
            if idx >= len(args) or not self.tag_is_player(args[idx], x, fk, self.contexts(x), depth, seen):
                return False
        return True

    def glob_of(self, rtag: str, ctx: list) -> list[str]:
        """The GLOBs a receiver tag names through the attachments' property values."""
        if not rtag.startswith("prop:") or "." in rtag:
            return []
        out = []
        for props, alias in ctx:
            v = props.get(rtag[5:])
            if isinstance(v, list) and len(v) == 2 and v[0] and v[0] in self.R["globs"]:
                out.append(v[0])
        return out


def quest_scripts(W: World, q: str) -> list[tuple[str, list]]:
    """(script, contexts) for each of the quest's own live scripts, the QF fragment script among them: the contexts are
    this quest's attachment of it alone."""
    vm = W.R["quests"][q].get("vmad") or {}
    out, names = [], set()
    for s in C.live_scripts(vm):
        n = s["name"].lower()
        if n not in names:
            names.add(n)
            out.append((n, [(W._props(s), None)]))
    frag = (vm.get("file") or "").lower()
    if frag and frag not in names:
        out.append((frag, [({}, None)]))
    return out


# the tag of a PlaceAtMe or PlaceActorAtMe result itself: the call last in the tag, its arguments' own calls one level deep
MADE = re.compile(r"\.place(?:actor)?atme\((?:[^()]|\([^()]*\))*\)$")


def verdict(W: World, subject: str, script: str, fkey: str, ctx: list) -> str:
    """Which tally a counted call joins: the player's, the world's, or made here: a call on the reference the same function
    placed (a PlaceAtMe or PlaceActorAtMe result, such as the marker PlayerVampireQuestScript places at its target and
    disables), which no other seat holds, so it is neither the player's state nor the world's and is reported alone. Only
    the placed reference itself is made here: a value derived from it (its base, as in
    Game.GetPlayer().PlaceActorAtMe(X).GetActorBase().SetEssential(true)) is judged as any other subject, and a tag the
    index cut at its length cap is never made here."""
    if len(subject) < C.CAP and MADE.search(subject):
        return "madeHere"
    return "counted" if W.tag_is_player(subject, script, fkey, ctx) else "notPlayer"


def judge(W: World, q: str) -> dict:
    """One quest's verdict and evidence."""
    rec = W.R["quests"][q]
    out = {"quest": q, "half": None, "player": False, "counted": collections.Counter(), "notPlayer": collections.Counter(),
           "madeHere": collections.Counter(), "globs": set(), "questCalls": collections.Counter(), "into": collections.Counter(), "scripts": [], "aliases": []}
    if rec["aliases"]:
        for a in rec["aliases"]:
            fill = {k: (W.lo.desc(v) if isinstance(v, str) and ":" in v else v) for k, v in a["fill"].items()}
            out["aliases"].append({"id": a["id"], "kind": a["kind"], "name": a["name"], "fill": fill,
                                   "player": W.alias_is_player(q, a["id"])})
        out["half"] = "aliases"
        out["player"] = all(a["player"] for a in out["aliases"])
    for script, ctx in quest_scripts(W, q):
        out["scripts"].append(f"{W.X[script]['n']} ({W.X[script]['src']})" if script in W.X else f"{script} (missing)")
        for d in C.chain(W.X, script):
            if d not in W.X:
                continue
            for fk, f in W.X[d]["fn"].items():
                for meth, rt, rtag, args in f["calls"]:
                    if meth in GLOBAL_WRITES and W.is_type(rt, "globalvariable"):
                        out["globs"].update(W.glob_of(rtag, ctx))
                    elif meth in QUEST_NATIVES and W.is_type(rt, "quest"):
                        out["questCalls"]["self" if rtag == "self" else rtag[:60]] += 1
                    elif meth in SPELL_CASTS and W.is_type(rt, "spell"):
                        subject = args[1] if len(args) > 1 and args[1] != "None" else (args[0] if args else "None")
                        out[verdict(W, subject, d, fk, ctx)][(meth, subject[:60])] += 1
                    elif meth in REF_NATIVES and (W.is_type(rt, "objectreference") or W.is_type(rt, "actorbase")):
                        out[verdict(W, rtag, d, fk, ctx)][(meth, rtag[:60])] += 1
                    elif rt in W.X and not W.X[rt]["native"] and rt not in C.chain(W.X, script):
                        out["into"][f"{W.X[rt]['n']}.{meth}"] += 1
                for prop, rt, rtag, vtag in f["ps"]:
                    if prop == "value" and W.is_type(rt, "globalvariable"):
                        out["globs"].update(W.glob_of(rtag, ctx))
                for cls, meth, args in f["cs"]:
                    if cls == "game" and meth in IMPLICIT:
                        out["counted"][(f"Game.{meth}", "the player")] += 1
    if out["half"] is None and (out["counted"] or out["notPlayer"]):
        out["half"] = "natives"
        out["player"] = bool(out["counted"]) and not out["notPlayer"]
    return out


def attached(W: World, q: str) -> list[str]:
    """The quest's own attached scripts in the index, its QF fragment script last."""
    vm = W.R["quests"][q].get("vmad") or {}
    frag = (vm.get("file") or "").lower()
    scripts = [s for s, ctx in quest_scripts(W, q) if s in W.X]
    return [s for s in scripts if s != frag] + [s for s in scripts if s == frag]


def own_scalars(W: World, q: str) -> list[str]:
    """The scalar variables (int, float, bool) its scripts declare, D-T2 B's own entries, as playerQuestVariables names
    them: "<attached script>::<variable as declared>", each attached script's chain read (user code only), the quest's
    own scripts first and its QF fragment script last."""
    out = []
    for script in attached(W, q):
        for d in C.chain(W.X, script):
            if d in W.X and not W.X[d]["native"]:
                out += [f"{W.X[script]['n']}::{decl}" for v, (decl, t) in sorted(W.X[d]["vars"].items()) if t in ("int", "float", "bool")]
    return list(dict.fromkeys(out))


def reach(W: World, q: str) -> tuple[list[str], set[tuple[str, int]]]:
    """Read 18's callers and PQ-3's stages: the call sites outside the quest's scripts that call a function of them, on a
    receiver whose type is one of its attached scripts or extends it, as "<caller>.<function> -> <script>.<function>
    (<what the caller is attached to>) x<n>"; and (quest, stage) for every QF stage fragment among those callers or among
    their own callers, to a depth of four."""
    scripts = attached(W, q)
    own = {d for s in scripts for d in C.chain(W.X, s) if d in W.X and not W.X[d]["native"]}
    hits = collections.Counter()
    reached = set()
    for s in scripts:
        names = {fk.split(".", 1)[1] for d in C.chain(W.X, s) if d in own for fk in W.X[d]["fn"]}
        for fname in sorted(names):
            for x, cfk, rt, rtag, args in W.callers(s, fname):
                if x in own:
                    continue
                kinds = sorted({k for k, o, a, p in W.attach.get(x, [])}) or ["unattached"]
                hits[f"{W.X[x]['n']}.{cfk.split('.', 1)[1]} -> {W.X[s]['n']}.{fname} ({','.join(kinds)})"] += 1
                reached.add((x, cfk))
    frontier = set(reached)
    for _ in range(MAX_DEPTH - 1):
        nxt = set()
        for x, cfk in frontier:
            for y, yfk, rt, rtag, args in W.callers(x, cfk.split(".", 1)[1]):
                if y not in own and (y, yfk) not in reached:
                    reached.add((y, yfk))
                    nxt.add((y, yfk))
        frontier = nxt
        if not frontier:
            break
    stages = {qs for x, cfk in reached for qs in W.fragments.get((x, cfk.split(".", 1)[1]), [])}
    return [f"{k} x{n}" for k, n in sorted(hits.items())], stages


def callers_into(W: World, q: str) -> list[str]:
    """Read 18's callers (reach's first half)."""
    return reach(W, q)[0]


def classify(W: World) -> dict[str, dict]:
    return {q: judge(W, q) for q in W.R["quests"]}


def settings_lists(settings: Path) -> tuple[set[str], set[str]]:
    mode = json.loads(Path(settings).read_text()).get("sharedQuestsMode") or {}
    return ({parse_form(d) for d in mode.get("denied") or []}, {parse_form(d) for d in mode.get("allowed") or []})


def emit(W: World, verdicts: dict, settings: Path) -> dict:
    denied, allowed = settings_lists(settings)
    keys, _ = C.condition_keys(W.R, W.X)
    marked = sorted((q for q, v in verdicts.items() if v["player"]), key=lambda q: (W.lo.runtime(q) or 0, q))
    served = [q for q in marked if split_plugin(q) in W.lo.server]
    marked_set = set(marked)
    reaches = {q: reach(W, q) for q in marked}
    callers = collections.defaultdict(set)  # world quest -> its stages that reach a marked quest's scripts
    for q in served:
        for world, stage in reaches[q][1]:
            if world not in marked_set and split_plugin(world) in W.lo.server:
                callers[world].add(stage)
    rows = []
    for q in marked:
        v = verdicts[q]
        rec = W.R["quests"][q]
        cond = sorted({json.dumps(C.condition_key_json(W.lo, W.X, kk)) for kk in keys if kk[0] == 629 and kk[1] == q})
        rows.append({
            "quest": W.lo.desc(q), "id": W.lo.show(q), "edid": rec["edid"], "half": v["half"], "winner": rec.get("file"),
            "flags": f"{rec['flags']:#06x}", "served": q in served, "denied": q in denied, "allowed": q in allowed,
            "aliases": [f"{a['id']} {a['name']}: {a['fill']}" for a in v["aliases"]],
            "scripts": v["scripts"],
            "natives": [f"{m} on {s} x{n}" for (m, s), n in sorted(v["counted"].items())],
            "madeHere": [f"{m} on {s} x{n}" for (m, s), n in sorted(v["madeHere"].items())],
            "globals": [f"{W.lo.desc(g)} {W.R['globs'].get(g, '?')}" for g in sorted(v["globs"])],
            "questCalls": [f"{t} x{n}" for t, n in sorted(v["questCalls"].items())],
            "callsInto": [f"{t} x{n}" for t, n in sorted(v["into"].items())],
            "conditionKeys": [json.loads(c) for c in cond],
            "ownVariables": own_scalars(W, q),
            "callers": reaches[q][0],
            "worldStages": [f"{W.lo.desc(w)} {W.R['quests'][w]['edid']} stage {n}"
                            for w, n in sorted(reaches[q][1], key=lambda ws: (W.lo.runtime(ws[0]) or 0, ws[0], ws[1]))
                            if w not in marked_set],
        })
    by_half = collections.Counter(v["half"] for v in verdicts.values() if v["player"])
    return {
        "playerQuests": [W.lo.desc(q) for q in served if verdicts[q]["half"] == "natives"],
        "playerQuestGlobals": {W.lo.desc(q): [W.lo.desc(g) for g in sorted(verdicts[q]["globs"])]
                               for q in served if verdicts[q]["globs"]},
        "playerQuestVariables": {W.lo.desc(q): own_scalars(W, q) for q in served if own_scalars(W, q)},
        "playerQuestCallers": {W.lo.desc(w): sorted(callers[w]) for w in sorted(callers, key=lambda w: (W.lo.runtime(w) or 0, w))},
        "census": {
            "quests": len(verdicts), "perPlayer": len(marked), "byHalf": dict(by_half),
            "clientOnly": [W.lo.desc(q) for q in marked if q not in served],
            "denied": [W.lo.desc(q) for q in marked if q in denied],
            "allowed": [W.lo.desc(q) for q in marked if q in allowed],
            "deniedListed": len(denied), "allowedListed": len(allowed),
            "loadOrder": {"plugins": len(W.lo.plugins), "server": len(W.lo.server), "archives": [a.name for a in W.lo.archives],
                          "loose": len(W.lo.loose), "scripts": len(W.X), "missing": W.lo.missing},
            "marked": rows,
        },
    }


def split_plugin(q: str) -> str:
    return C.split(q)[1]


def sizes(W: World) -> None:
    """Finding 5's sizes: over every script attached to a quest (its scripts, QF and alias scripts) and to a world trigger
    (an ACTI base or a placement of one whose script has an OnTriggerEnter with code), counted once per script: (i) calls
    Game.GetPlayer; (ii) holds an Actor or ObjectReference property valued the player's reference on some attachment;
    (iii) of (ii), compares (cmp_eq) a GetPlayer result or such a property; (ii-a) holds a property naming a player alias."""
    X = W.X

    def has_ote(s):
        return any(fk.endswith(".ontriggerenter") and f["ni"] > 0 for d in C.chain(X, s) if d in X for fk, f in X[d]["fn"].items())

    def ptype(s, p):
        for d in C.chain(X, s):
            if d in X and p in X[d]["props"]:
                return X[d]["props"][p][0]
        return None

    groups = {"quest": collections.defaultdict(list), "trigger": collections.defaultdict(list)}
    for s, rows in W.attach.items():
        for kind, owner, alias, props in rows:
            if kind in ("QUST", "alias"):
                groups["quest"][s].append(props)
            elif kind == "ACTI" or (kind == "REFR" and (W.R["vmads"].get(owner) or {}).get("base") in W.R["actis"]):
                if has_ote(s):
                    groups["trigger"][s].append(props)
    tot = collections.Counter()
    for group, table in groups.items():
        for s, attachments in table.items():
            if s not in X:
                tot[(group, "missing from the scripts")] += 1
                continue
            gp = any(f["gp"] for d in C.chain(X, s) if d in X for f in X[d]["fn"].values())
            pprops = {p for props in attachments for p, v in props.items()
                      if isinstance(v, list) and len(v) == 2 and v[0] == C.PLAYER_REF and ptype(s, p) in ("actor", "objectreference")}
            aprops = {p for props in attachments for p, v in props.items()
                      if isinstance(v, list) and len(v) == 2 and isinstance(v[1], int) and v[1] >= 0 and W.value_is_player(v)}
            cmp = any(o == "getplayer" or (o.startswith("prop:") and o[5:] in pprops)
                      for f in X[s]["fn"].values() for pair in f["cmp"] for o in pair)
            tot[(group, "scripts")] += 1
            tot[(group, "(i) GetPlayer")] += gp
            tot[(group, "(ii) a 0x14 property")] += bool(pprops)
            tot[(group, "(iii) of (ii), compares it")] += bool(pprops) and cmp
            tot[(group, "(i) or (ii)")] += gp or bool(pprops)
            tot[(group, "(ii-a) a player alias property")] += bool(aprops)
    for (group, what), n in sorted(tot.items()):
        print(f"  {group}: {what}: {n}")


def show(W: World, verdicts: dict, q: str) -> None:
    rec = W.R["quests"].get(q)
    if rec is None:
        print(f"== {W.lo.desc(q)}: no such quest in the load order")
        return
    v = verdicts[q]
    print(f"== {W.lo.show(q)} {W.lo.desc(q)} {rec['edid']} flags {rec['flags']:#06x} winner {rec.get('file')}: "
          f"{'PLAYER' if v['player'] else 'world'} ({v['half'] or 'no alias, no counted call'})")
    for a in v["aliases"]:
        print(f"   alias {a['id']} {a['kind']} {a['name']}: fill {a['fill']} -> {'player' if a['player'] else 'not the player'}")
    print(f"   scripts: {', '.join(v['scripts']) or 'none'}")
    for (m, s), n in sorted(v["counted"].items()):
        print(f"   counted, the player: {m} on {s} x{n}")
    for (m, s), n in sorted(v["notPlayer"].items()):
        print(f"   counted, NOT the player: {m} on {s} x{n}")
    for (m, s), n in sorted(v["madeHere"].items()):
        print(f"   made here (not counted): {m} on {s} x{n}")
    print(f"   GLOBs written: {[W.lo.desc(g) + ' ' + W.R['globs'].get(g, '?') for g in sorted(v['globs'])]}")
    print(f"   quest calls: {dict(v['questCalls'])}")
    print(f"   calls into other scripts: {dict(v['into'].most_common(12))}")
    lines, stages = reach(W, q)
    for c in lines:
        print(f"   caller: {c}")
    for w, n in sorted(stages, key=lambda ws: (W.lo.runtime(ws[0]) or 0, ws[1])):
        print(f"   PQ-3 stage: {W.lo.desc(w)} {W.R['quests'][w]['edid']} stage {n}{' (a marked quest)' if verdicts[w]['player'] else ''}")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--emit", action="store_true", help="the settings' playerQuests, playerQuestGlobals, playerQuestVariables and "
                    "playerQuestCallers, with the evidence, as JSON")
    ap.add_argument("--show", nargs="+", metavar="QUEST", help="one or more quests' aliases, scripts and counted calls")
    C.add_arguments(ap)
    args = ap.parse_args(argv)
    lo, R, X = C.load(args)
    W = World(lo, R, X["scripts"])
    verdicts = classify(W)
    if args.emit:
        print(json.dumps(emit(W, verdicts, Path(args.settings)), indent=1))
        return 0
    if args.show:
        for text in args.show:
            show(W, verdicts, parse_form(text, lo))
        return 0
    print("finding 5's sizes over the deployed scripts:")
    sizes(W)
    marked = [q for q, v in verdicts.items() if v["player"]]
    print(f"quests {len(verdicts)}; per player {len(marked)}: " + ", ".join(
        f"{lo.show(q)} {R['quests'][q]['edid']} ({verdicts[q]['half']})" for q in sorted(marked, key=lambda q: lo.runtime(q) or 0)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
