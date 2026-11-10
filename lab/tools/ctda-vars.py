#!/usr/bin/env python3
"""ctda-vars.py: the variables dialogue conditions read, over the deployed load order (thuum ADR-068 rung 5, H-CV1's
census for D-V1: docs/research/rung5-quests-2026-11-09.md 1(e) and section 7). Runs on sky-srv over lab/census.py's
index; prints derived facts only.

A key is what a 629 GetVMQuestVariable or 630 GetVMScriptVariable condition reads (CommonLibSSE-NG include/RE/T/
TESCondition.h:762-763): the form (a quest for 629, a reference for 630, its base's scripts read too), the attached
script whose chain declares the variable, and the variable (CIS2, UESP "Skyrim Mod:Mod File Format/CTDA Field"):
lab/census.py's condition_keys. The deploy's keys are those an INFO or a SCEN condition reads (the dialogue scope);
a key only a quest's, a package's or a perk's condition reads is counted as an aside.

Writers of a key's variable V declared in script D:
- direct: a function of D whose destination operands name V (a property's set handler included); a property set, in
  any script, of the property whose auto variable is V (or whose set handler writes V) on a receiver whose static
  type is D or a descendant;
- through calls: a function calling a writer method on a receiver of D's family, to a fixpoint of six rounds;
- entry points: the writer functions that are events (On*) or fragments (Fragment_*), or that nothing calls. Kinds by
  the entry point's script: QF, TIF, SF, PF (the fragment file a record's VMAD names, else the prefix), QS (the key's
  quest's own script chain), other (another quest's script, an alias script, a reference's, unattached).
Under D-V1 B every seat reports a listed variable it changes, so a TIF writer (the talking seat's) is as listed as a QF
one; the kinds size the stake, they do not filter the list.

    ctda-vars.py           the summary, the kinds, the top only-TIF keys and the unresolved conditions
    ctda-vars.py --tsv     one line per key (the table the 11-09 census kept as lab/.cache/census/r5/ctda-vars.tsv)
    ctda-vars.py --emit    JSON: the deploy settings' conditionVariables, [{form, script, var}], and the counts

lab/census.py's arguments (--settings, --esm, --mods, --game, --version, --cache) name the load order.
"""
from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import census as C  # noqa: E402


class Writers:
    """The writer analysis over the index's scripts."""

    def __init__(self, R: dict, X: dict):
        self.R, self.X = R, X
        self.calls = collections.defaultdict(list)  # method -> [(caller script, caller function name, receiver type)]
        self.propsets = collections.defaultdict(list)  # property -> [(script, function name, receiver type)]
        for x, s in X.items():
            for fk, f in s["fn"].items():
                fn = fk.split(".", 1)[1]
                for meth, rt, rtag, args in f["calls"]:
                    self.calls[meth].append((x, fn, rt))
                for prop, rt, rtag, vtag in f["ps"]:
                    self.propsets[prop].append((x, fn, rt))
        # a fragment script is the file its record's VMAD fragment section names (UESP "VMAD Field": QUST QF_, INFO
        # TIF_, SCEN SF_, PACK PF_, PERK PRKF_; HearthFires names its TIFs BYOH_TIF__)
        self.fragkind = {}
        for src, k in (("quests", "QF"), ("infos", "TIF"), ("scenes", "SF")):
            for r in R[src].values():
                if r.get("vmad") and r["vmad"].get("file"):
                    self.fragkind[r["vmad"]["file"].lower()] = k
        for r in R["vmads"].values():
            if r["type"] in ("PACK", "PERK") and r["vmad"].get("file"):
                self.fragkind[r["vmad"]["file"].lower()] = "PF" if r["type"] == "PACK" else "other:perk"
        self.attach = collections.defaultdict(set)
        for q in R["quests"].values():
            for s in C.scripts_of(q):
                self.attach[s].add("quest")
            for a in (q["vmad"] or {}).get("aliases", []):
                for s in C.live_scripts(a):
                    self.attach[s["name"].lower()].add("alias")
        for r in R["vmads"].values():
            for s in C.scripts_of(r):
                self.attach[s].add(r["type"])

    def family(self, rt: str, d: str) -> bool:
        return rt in self.X and d in C.chain(self.X, rt)

    def kind(self, x: str, own: set) -> str:
        if x in self.fragkind:
            return self.fragkind[x]
        for pre, k in (("qf_", "QF"), ("tif_", "TIF"), ("sf_", "SF"), ("pf_", "PF"), ("prkf_", "other:perk")):
            if x.startswith(pre):
                return k
        if x in own:
            return "QS"
        a = self.attach.get(x, set())
        return "other:" + ("quest" if "quest" in a else "alias" if "alias" in a else (sorted(a)[0] if a else "unattached"))

    def of(self, d: str, v: str) -> tuple[set, set, set]:
        """(direct writers, every writer function, entry points) as (script, function name) sets."""
        X = self.X
        sd = X[d]
        props = [p for p, (pt, av, wv) in sd["props"].items() if av == v or v in wv]
        direct = {(d, fk.split(".", 1)[1]) for fk, f in sd["fn"].items() if v in f["w"]}
        for p, (pt, av, wv) in sd["props"].items():
            if v in wv:
                direct.add((d, "set " + p))
        for p in props:
            for x, fn, rt in self.propsets[p]:
                if self.family(rt, d) or (rt == "?" and x == d):
                    direct.add((x, fn))
        allw, frontier, called = set(direct), set(direct), set()
        for _ in range(6):
            nxt = set()
            for (z, fn) in frontier:
                if fn.startswith("set ") or fn.startswith("fragment_"):
                    continue
                for x, g, rt in self.calls[fn]:
                    if rt == "parent" and x in X and z in C.chain(X, X[x]["par"]):
                        pass
                    elif not self.family(rt, z):
                        continue
                    called.add((z, fn))
                    if (x, g) not in allw:
                        allw.add((x, g))
                        nxt.add((x, g))
            frontier = nxt
            if not frontier:
                break
        entries = {(x, fn) for (x, fn) in allw
                   if fn.startswith("on") or fn.startswith("fragment_") or ((x, fn) not in called and not fn.startswith("set "))}
        return direct, allw, entries


def table(lo, R: dict, X: dict) -> tuple[list, collections.Counter, dict, collections.Counter]:
    """(rows, summary, lists by name, unresolved): one row per key with its readers and its writers' kinds."""
    keys, unresolved = C.condition_keys(R, X)
    W = Writers(R, X)
    Q, V = R["quests"], R["vmads"]
    rows, summary, lists = [], collections.Counter(), collections.defaultdict(list)
    for kk, info in sorted(keys.items()):
        func, form, s, d, var = kk
        if func == 629:
            own = {c for x in C.scripts_of(Q.get(form)) if not x.startswith("qf_") for c in C.chain(X, x)}
            fedid = (Q.get(form) or {}).get("edid", "?")
        else:
            own = set(C.chain(X, s))
            fedid = (V.get(form) or {}).get("edid", "?")
        direct, allw, entries = W.of(d, var)
        dk = sorted({W.kind(x, own) for x, _ in direct})
        ek = sorted({W.kind(x, own) for x, _ in entries})
        n = info["n"]
        scope = "dialogue" if (n["INFO"] or n["SCEN"]) else "aside"
        summary[(scope, "keys")] += 1
        simple = {k.split(":")[0] for k in ek}
        if scope == "dialogue":
            lists["dialogue"].append(kk)
            if not ek:
                summary[(scope, "no writer found")] += 1
            if "TIF" in simple:
                summary[(scope, "any TIF writer")] += 1
                if simple == {"TIF"}:
                    summary[(scope, "only TIF writers")] += 1
                    lists["onlytif"].append(kk)
            for k in ("QF", "QS", "SF", "PF", "other"):
                if k in simple:
                    summary[(scope, "any " + k + " writer")] += 1
            if simple and not (simple & {"QF", "QS"}):
                summary[(scope, "no QF or QS writer (single-seat writers only)")] += 1
        ex = ";".join(f"{W.kind(x, own)}={X[x]['n'] if x in X else x}.{fn}" for x, fn in sorted(entries)[:6])
        rows.append({"kk": kk, "func": func, "form": lo.desc(form), "id": lo.show(form), "edid": fedid,
                     "script": X[s]["n"], "declared": X[d]["n"], "var": X[d]["vars"][var][0],
                     "info": n["INFO"], "scen": n["SCEN"], "other": sum(n.values()) - n["INFO"] - n["SCEN"],
                     "direct": ",".join(dk) or "-", "entry": ",".join(ek) or "-", "entries": len(entries), "examples": ex})
    return rows, summary, lists, unresolved


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--emit", action="store_true", help="the deploy settings' conditionVariables as JSON, with the counts")
    ap.add_argument("--tsv", action="store_true", help="one line per key")
    C.add_arguments(ap)
    args = ap.parse_args(argv)
    lo, R, Xi = C.load(args)
    X = Xi["scripts"]
    rows, summary, lists, unresolved = table(lo, R, X)
    if args.emit:
        # in the load order's id order, then by script and variable
        order = sorted(lists["dialogue"], key=lambda kk: (lo.runtime(kk[1]) or 0, kk[1], kk[2], kk[4]))
        dialogue = [C.condition_key_json(lo, X, kk) for kk in order]
        served = [C.condition_key_json(lo, X, kk) for kk in order if C.split(kk[1])[1] in lo.server]
        print(json.dumps({
            "conditionVariables": served,
            "census": {"keys": dict((f"{a} {b}", n) for (a, b), n in sorted(summary.items())),
                       "dialogueConditions": sum(r["info"] + r["scen"] for r in rows if r["info"] or r["scen"]),
                       "clientOnly": [k for k in dialogue if k not in served],
                       "unresolvedConditions": sum(unresolved.values()), "unresolvedKeys": len(unresolved),
                       "plugins": len(lo.plugins), "scripts": len(X)},
        }, indent=1))
        return 0
    if args.tsv:
        cols = ["func", "form", "id", "edid", "script", "declared", "var", "info", "scen", "other", "direct", "entry", "entries", "examples"]
        print("\t".join(cols))
        for r in rows:
            print("\t".join(str(r[c]) for c in cols))
        return 0
    print("summary:", {f"{a}/{b}": v for (a, b), v in sorted(summary.items())})
    print("conditions behind dialogue keys:", sum(r["info"] + r["scen"] for r in rows if r["info"] or r["scen"]))
    print("unresolved (func, form, var, src):", len(unresolved), "conditions", sum(unresolved.values()))
    for (func, form, var, src), n in sorted(unresolved.items(), key=lambda x: -x[1])[:25]:
        rec = R["quests"].get(form) or R["vmads"].get(form) or {}
        print(f"  {func} {lo.show(form) if form else '-'} {rec.get('edid', '?')} {var} {src} x{n} scripts={C.scripts_of(rec)[:4]}")
    print("only-TIF keys by dialogue conditions (top 25):")
    by_kk = {r["kk"]: r for r in rows}
    for kk in sorted(lists["onlytif"], key=lambda kk: -(by_kk[kk]["info"] + by_kk[kk]["scen"]))[:25]:
        r = by_kk[kk]
        print(f"  {r['id']} {r['edid']} {r['script']} {r['var']} INFO {r['info']} SCEN {r['scen']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
