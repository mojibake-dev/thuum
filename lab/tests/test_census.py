"""lab/census.py, lab/tools/quest-census.py and lab/tools/ctda-vars.py against a synthetic load order: two plugins and a
client-only one built by hand in UESP's layout (records, VMAD, CTDA, aliases) and scripts built with lab/pex.py, laid
as a deploy is (an esm directory, the layer's SHA256SUMS and plugins.txt), so the rule and both emits are checked
without a licensed file."""

import importlib.util
import io
import json
import struct
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))
sys.path.insert(0, str(ROOT / "lab" / "tests"))
import census as C  # noqa: E402
import pex  # noqa: E402
from test_bsa_extract import bsa105  # noqa: E402


def tool(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "lab" / "tools" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


QC = tool("quest-census")
CV = tool("ctda-vars")


# ----- plugins ----------------------------------------------------------------------------------------------------

def field(name, data):
    return struct.pack("<4sH", name.encode(), len(data)) + data


def record(rtype, fid, fields, flags=0):
    return struct.pack("<4sIIIHHHH", rtype.encode(), len(fields), flags, fid, 0, 0, 44, 0) + fields


def group(label, body, gtype=0):
    lab = label.encode() if isinstance(label, str) else struct.pack("<I", label)
    return struct.pack("<4sI4siHHI", b"GRUP", 24 + len(body), lab, gtype, 0, 0, 0) + body


def tes4(masters=(), flags=0):
    body = field("HEDR", struct.pack("<fII", 1.7, 0, 0x800))
    for m in masters:
        body += field("MAST", m.encode() + b"\0") + field("DATA", struct.pack("<Q", 0))
    return record("TES4", 0, body, flags)


def zs(text):
    return text.encode() + b"\0"


def wstr(text):
    return struct.pack("<H", len(text)) + text.encode()


def obj2(fid, alias=-1):
    """A VMAD object in format 2: uint16 unused, int16 alias, uint32 form id."""
    return struct.pack("<HhI", 0, alias, fid)


def vmad_script(name, props):
    out = wstr(name) + struct.pack("<B", 0) + struct.pack("<H", len(props))
    for pname, fid in props:
        out += wstr(pname) + struct.pack("<BB", 1, 1) + obj2(fid)
    return out


def quest_vmad(scripts, fragment_file=""):
    body = struct.pack("<hhH", 5, 2, len(scripts)) + b"".join(vmad_script(n, p) for n, p in scripts)
    return body + struct.pack("<bH", 2, 0) + wstr(fragment_file) + struct.pack("<H", 0)


def alias(aid, name, fills=(), kind="ALST"):
    out = field(kind, struct.pack("<I", aid)) + field("ALID", zs(name)) + field("FNAM", struct.pack("<I", 0))
    for t, v in fills:
        out += field(t, struct.pack("<I", v))
    return out + field("ALED", b"")


def quest(fid, edid, vmad=None, aliases=b"", flags=0x11):
    body = field("EDID", zs(edid))
    if vmad is not None:
        body += field("VMAD", vmad)
    body += field("DNAM", struct.pack("<HBBi", flags, 0, 0, 0)) + field("INDX", struct.pack("<hBB", 10, 0, 0)) + aliases
    return record("QUST", fid, body)


def ctda(func, p1, cis2=None):
    data = struct.pack("<B3xfH2xIIIIi", 0, 1.0, func, p1, 0, 0, 0, 0)
    return field("CTDA", data) + (field("CIS2", zs(cis2)) if cis2 else b"")


def skyrim_esm():
    quests = b"".join([
        # the list half's quest: no alias; its script adds to PlayerRef (0x14), races a parameter every caller passes the
        # player to, and writes the GLOB PlayerIsX
        quest(0xB001, "PQ", quest_vmad([("PQScript", [("PlayerRef", 0x14), ("PlayerIsX", 0xA001)])])),
        # the alias half: one alias, the player's unique actor (ALUA 0x7)
        quest(0xB002, "WW", aliases=alias(0, "Player", [("ALUA", 0x7)])),
        # one alias the player's, one a world NPC's: the world's
        quest(0xB003, "Mixed", aliases=alias(0, "Player", [("ALFR", 0x14)]) + alias(1, "Npc", [("ALFR", 0xC001)])),
        # no alias; its script enables a world reference: the world's
        quest(0xB004, "WorldQ", quest_vmad([("WorldScript", [("SomeRef", 0xC002)])])),
        # an item created in the player's alias (ALCA: alias 0, 0x8000 "in")
        quest(0xB005, "Created", aliases=alias(0, "Player", [("ALFR", 0x14)]) + alias(1, "Item", [("ALCO", 0xD001), ("ALCA", 0x80000000)])),
        # a location alias: the world's whatever the rest
        quest(0xB006, "Located", aliases=alias(0, "Player", [("ALFR", 0x14)]) + alias(1, "Where", kind="ALLS")),
    ])
    info = record("INFO", 0xE002, field("EDID", zs("PQInfo")) + ctda(629, 0xB001, "::Status_var") + ctda(72, 0xC001))
    return b"".join([
        tes4(),
        group("GLOB", record("GLOB", 0xA001, field("EDID", zs("PlayerIsX")))),
        group("QUST", quests),
        group("DIAL", record("DIAL", 0xE001, field("EDID", zs("PQTopic")) + field("QNAM", struct.pack("<I", 0xB001)))
              + group(0xE001, info, gtype=7)),
    ])


def mod_esp():
    # a later plugin deletes Mixed (0xB003, Skyrim.esm's: top byte 00 is its first master) and adds its own quest
    return tes4(["Skyrim.esm"]) + group("QUST", record("QUST", 0xB003, b"", flags=0x20)
                                       + quest(0x01000800, "ModQ", aliases=alias(0, "Player", [("ALFR", 0x14)])))


def client_esp():
    return tes4(["Skyrim.esm"]) + group("QUST", quest(0x01000801, "ClientQ", aliases=alias(0, "Player", [("ALUA", 0x7)])))


# ----- scripts ----------------------------------------------------------------------------------------------------

class Asm:
    """One compiled script built by hand: lab/pex.py's dataclasses, written by pex.write."""

    def __init__(self):
        self.p = pex.Pex(3, 2, 1, 0, b"t.psc", b"u", b"m", [], None, [], [])
        self.s("")

    def s(self, text):
        return self.p.index(text)

    def id(self, name):
        return pex.Value(1, struct.pack(">H", self.s(name)))

    def int(self, n):
        return pex.Value(3, struct.pack(">i", n))

    def none(self):
        return pex.Value(0, b"")

    def ins(self, op, args, var=None):
        return pex.Instruction(op, args, None if var is None else [self.int(len(var))] + var)

    def call(self, meth, recv, args, dest="::NoneVar"):
        return self.ins(23, [self.id(meth), self.id(recv), self.id(dest)], args)

    def static(self, cls, meth, dest, args=()):
        return self.ins(25, [self.id(cls), self.id(meth), self.id(dest)], list(args))

    def fn(self, params, instructions, locals_=()):
        return pex.Function(self.s("None"), self.s(""), 0, 0, [(self.s(n), self.s(t)) for n, t in params],
                            [(self.s(n), self.s(t)) for n, t in locals_], instructions)

    def build(self, name, parent, props=(), functions=()):
        """props: (name, type); each an auto property over "::<name>_var". functions: (name, Function)."""
        variables = [pex.Variable(self.s(f"::{n}_var"), self.s(t), 0, self.none()) for n, t in props]
        properties = [pex.Property(self.s(n), self.s(t), self.s(""), 0, 7, self.s(f"::{n}_var"), None, None) for n, t in props]
        states = [pex.State(self.s(""), [(self.s(n), f) for n, f in functions])]
        self.p.objects.append(pex.Object(self.s(name), self.s(parent), self.s(""), 0, self.s(""), variables, properties, states))
        return pex.write(self.p)


def scripts():
    out = {}
    for name, parent in (("Form", ""), ("ObjectReference", "Form"), ("Actor", "ObjectReference"), ("Quest", "Form"),
                         ("GlobalVariable", "Form"), ("ActiveMagicEffect", "")):
        out[name] = Asm().build(name, parent)
    a = Asm()
    out["PQScript"] = a.build("PQScript", "Quest", props=[("PlayerRef", "actor"), ("Status", "int"), ("PlayerIsX", "globalvariable")],
                              functions=[
                                  ("Turn", a.fn([("Target", "actor")], [a.call("SetRace", "Target", [a.none()]),
                                                                        a.call("PlaceAtMe", "Target", [a.none()], dest="::temp1"),
                                                                        a.call("Disable", "::temp1", [])],
                                                locals_=[("::temp1", "objectreference")])),
                                  ("OnInit", a.fn([], [a.call("AddItem", "::PlayerRef_var", [a.none(), a.int(1)]),
                                                       a.call("SetValue", "::PlayerIsX_var", [a.int(1)]),
                                                       a.ins(13, [a.id("::Status_var"), a.int(1)])])),
                              ])
    a = Asm()
    out["CallerScript"] = a.build("CallerScript", "ActiveMagicEffect", props=[("PQ", "pqscript")], functions=[
        ("OnEffectStart", a.fn([("akTarget", "actor"), ("akCaster", "actor")],
                               [a.static("Game", "GetPlayer", "::temp0"), a.call("Turn", "::PQ_var", [a.id("::temp0")])],
                               locals_=[("::temp0", "actor")]))])
    a = Asm()
    out["WorldScript"] = a.build("WorldScript", "Quest", props=[("SomeRef", "objectreference")], functions=[
        ("OnInit", a.fn([], [a.call("Enable", "::SomeRef_var", [])]))])
    return out


class Deploy:
    """A deploy laid in a temporary directory: the settings, the esm directory, the layer (loose scripts and the
    client-only plugin, listed in SHA256SUMS and plugins.txt) and an empty game directory."""

    def __init__(self, tmp: Path):
        self.settings = tmp / "server-settings.json"
        self.settings.write_text(json.dumps({
            "loadOrder": ["/srv/skymp/esm/Skyrim.esm", "/srv/skymp/esm/Mod.esp"],
            "sharedQuestsMode": {"mode": "all", "denied": ["b004:Skyrim.esm"], "allowed": ["b001:Skyrim.esm"]}}))
        self.esm = tmp / "esm"
        self.esm.mkdir()
        (self.esm / "Skyrim.esm").write_bytes(skyrim_esm())
        (self.esm / "Mod.esp").write_bytes(mod_esp())
        self.mods = tmp / "mods"
        sums = []
        for name, data in scripts().items():
            path = self.mods / "lab-scripts" / "Scripts" / f"{name}.pex"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            sums.append(f"{'0' * 64}  lab-scripts/Scripts/{name}.pex")
        (self.mods / "client-mod").mkdir()
        (self.mods / "client-mod" / "Client.esp").write_bytes(client_esp())
        sums.append(f"{'0' * 64}  client-mod/Client.esp")
        (self.mods / "SHA256SUMS").write_text("\n".join(sums) + "\n")
        (self.mods / "plugins.txt").write_text("Mod.esp\nClient.esp\n")
        self.game = tmp / "game"
        self.game.mkdir()
        self.cache = tmp / "cache"

    def args(self):
        return ["--settings", str(self.settings), "--esm", str(self.esm), "--mods", str(self.mods), "--game", str(self.game),
                "--cache", str(self.cache)]

    def load(self):
        lo = C.deployed(self.settings, self.esm, self.mods, self.game, "1.6.1170")
        R, X = C.index(lo, self.cache, log=lambda m: None)
        return lo, R, X


class CensusTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.d = Deploy(Path(self._tmp.name))

    def tearDown(self):
        self._tmp.cleanup()

    def test_the_load_order_is_the_servers_then_the_client_only_tail(self):
        lo = C.deployed(self.d.settings, self.d.esm, self.d.mods, self.d.game, "1.6.1170")
        self.assertEqual([n for n, _ in lo.plugins], ["Skyrim.esm", "Mod.esp", "Client.esp"])
        self.assertEqual(lo.server, {"skyrim.esm", "mod.esp"})
        self.assertEqual(sorted(lo.loose), ["activemagiceffect", "actor", "callerscript", "form", "globalvariable",
                                            "objectreference", "pqscript", "quest", "worldscript"])
        self.assertEqual(lo.desc(C.key("skyrim.esm", 0xEAFD5)), "eafd5:Skyrim.esm")
        self.assertEqual(lo.runtime(C.key("mod.esp", 0x800)), 0x01000800)
        self.assertEqual(lo.runtime(C.key("client.esp", 0x801)), 0x02000801)
        self.assertIsNone(lo.runtime(C.key("nosuch.esp", 1)))
        self.assertEqual(lo.ident(0x02000801), C.key("client.esp", 0x801))
        self.assertEqual(QC.parse_form("0x01000800", lo), C.key("mod.esp", 0x800))
        self.assertEqual(QC.parse_form("eafd5:Skyrim.esm"), C.key("skyrim.esm", 0xEAFD5))

    def test_records_take_the_winning_override_and_a_deletion_removes_one(self):
        lo, R, X = self.d.load()
        Q = R["quests"]
        self.assertNotIn(C.key("skyrim.esm", 0xB003), Q, "Mod.esp's Deleted record removed Mixed")
        self.assertIn(C.key("mod.esp", 0x800), Q)
        pq = Q[C.key("skyrim.esm", 0xB001)]
        self.assertEqual((pq["edid"], pq["flags"], pq["stages"], pq["file"]), ("PQ", 0x11, [10], "Skyrim.esm"))
        props = {p: v for p, t, v in pq["vmad"]["scripts"][0]["props"]}
        self.assertEqual(props, {"PlayerRef": [C.PLAYER_REF, -1], "PlayerIsX": [C.key("skyrim.esm", 0xA001), -1]})
        ww = Q[C.key("skyrim.esm", 0xB002)]["aliases"]
        self.assertEqual(ww, [{"kind": "ALST", "id": 0, "name": "Player", "flags": 0, "fill": {"ALUA": C.PLAYER_BASE}}])
        info = R["infos"][C.key("skyrim.esm", 0xE002)]
        self.assertEqual(info["dial"], C.key("skyrim.esm", 0xE001))
        self.assertEqual([(c["func"], c["p1"], c["cis2"]) for c in info["ctda"]], [(629, C.key("skyrim.esm", 0xB001), "::Status_var")])
        self.assertEqual(R["globs"], {C.key("skyrim.esm", 0xA001): "PlayerIsX"})
        self.assertEqual(C.alca(0x80000000), (0, True))
        self.assertEqual(C.alca(0x0000FFFF), (-1, False))

    def test_the_index_is_kept_and_reused_until_an_input_changes(self):
        lo, R, X = self.d.load()
        self.assertTrue((self.d.cache / "records.json").is_file())
        logs = []
        C.index(lo, self.d.cache, log=logs.append)
        self.assertTrue(any("reused" in m for m in logs), logs)
        (self.d.mods / "lab-scripts" / "Scripts" / "WorldScript.pex").write_bytes(scripts()["WorldScript"] + b"")
        import os
        os.utime(self.d.mods / "lab-scripts" / "Scripts" / "WorldScript.pex", (1, 1))
        logs.clear()
        C.index(C.deployed(self.d.settings, self.d.esm, self.d.mods, self.d.game, "1.6.1170"), self.d.cache, log=logs.append)
        self.assertFalse(any("reused" in m for m in logs), logs)

    def test_a_loose_script_beats_an_archives_copy(self):
        lo = C.deployed(self.d.settings, self.d.esm, self.d.mods, self.d.game, "1.6.1170")
        lo.archives = [Path("fake.bsa")]
        other = Asm().build("PQScript", "Form")
        real = C._archive_scripts
        C._archive_scripts = lambda path: iter([("pqscript", lambda: other), ("onlyarchived", lambda: Asm().build("OnlyArchived", "Form"))])
        try:
            X = C.index_scripts(lo, log=lambda m: None)["scripts"]
        finally:
            C._archive_scripts = real
        self.assertEqual(X["pqscript"]["par"], "quest", "the layer's loose PQScript, not the archive's")
        self.assertEqual(X["pqscript"]["src"], "loose:lab-scripts")
        self.assertEqual(X["onlyarchived"]["src"], "fake.bsa")

    def test_an_archives_scripts_are_read_by_offset_from_its_table(self):
        data = scripts()["WorldScript"]
        arc = Path(self._tmp.name) / "Mod.bsa"
        arc.write_bytes(bsa105({"worldscript.pex": data, "readme.txt": b"no script"}, folder=b"scripts"))
        found = {name: read() for name, read in C._archive_scripts(arc)}
        self.assertEqual(found, {"worldscript": data})

    def test_the_provenance_pass_tags_receivers_arguments_and_writes(self):
        lo, R, Xi = self.d.load()
        X = Xi["scripts"]
        turn = X["pqscript"]["fn"][".turn"]
        self.assertEqual(turn["params"], ["target"])
        self.assertEqual(turn["calls"][0], ["setrace", "actor", "param:target", ["None"]])
        self.assertEqual(turn["calls"][2], ["disable", "objectreference", "param:target.placeatme(None)", []])
        init = X["pqscript"]["fn"][".oninit"]
        self.assertEqual(init["calls"][0], ["additem", "actor", "prop:playerref", ["None", "1"]])
        self.assertEqual(init["vw"], {"::status_var": ["1"]})
        caller = X["callerscript"]["fn"][".oneffectstart"]
        self.assertTrue(caller["gp"])
        self.assertEqual(caller["calls"], [["turn", "pqscript", "prop:pq", ["getplayer"]]])
        self.assertEqual(X["pqscript"]["vars"]["::status_var"], ["::Status_var", "int"])

    def test_the_rule_marks_each_half_and_leaves_the_world_its_own(self):
        lo, R, Xi = self.d.load()
        W = QC.World(lo, R, Xi["scripts"])
        v = QC.classify(W)
        k = lambda n: C.key("skyrim.esm", n)  # noqa: E731
        self.assertEqual((v[k(0xB001)]["half"], v[k(0xB001)]["player"]), ("natives", True))
        self.assertEqual(dict(v[k(0xB001)]["counted"]), {("additem", "prop:playerref"): 1, ("setrace", "param:target"): 1,
                                                          ("placeatme", "param:target"): 1})
        self.assertEqual(dict(v[k(0xB001)]["madeHere"]), {("disable", "param:target.placeatme(None)"): 1},
                         "the marker the function placed is neither the player's nor the world's")
        self.assertEqual(v[k(0xB001)]["globs"], {k(0xA001)})
        self.assertEqual((v[k(0xB002)]["half"], v[k(0xB002)]["player"]), ("aliases", True))
        self.assertEqual((v[k(0xB004)]["half"], v[k(0xB004)]["player"]), ("natives", False))
        self.assertEqual(dict(v[k(0xB004)]["notPlayer"]), {("enable", "prop:someref"): 1})
        self.assertTrue(v[k(0xB005)]["player"], "an item created in the player's alias is the player's")
        self.assertFalse(v[k(0xB006)]["player"], "a location alias makes the quest the world's")
        self.assertTrue(v[C.key("mod.esp", 0x800)]["player"])
        # a parameter no caller passes the player to is not the player's
        self.assertFalse(W.param_is_player("worldscript", ".oninit", "x", 1, frozenset()))

    def test_quest_census_emits_the_settings_lists_and_their_evidence(self):
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(io.StringIO()):
            self.assertEqual(QC.main(["--emit"] + self.d.args()), 0)
        e = json.loads(out.getvalue())
        self.assertEqual(e["playerQuests"], ["b001:Skyrim.esm"], "the list half only: the alias half is the server's own rule")
        self.assertEqual(e["playerQuestGlobals"], {"b001:Skyrim.esm": ["a001:Skyrim.esm"]})
        c = e["census"]
        self.assertEqual(c["byHalf"], {"natives": 1, "aliases": 4})
        self.assertEqual(c["clientOnly"], ["801:Client.esp"], "a client-only plugin's quest is counted, never emitted")
        self.assertEqual((c["denied"], c["allowed"]), ([], ["b001:Skyrim.esm"]))
        pq = next(r for r in c["marked"] if r["quest"] == "b001:Skyrim.esm")
        self.assertEqual(pq["conditionKeys"], [{"form": "b001:Skyrim.esm", "script": "PQScript", "var": "::Status_var"}])
        self.assertEqual(pq["ownVariables"], ["PQScript::::Status_var"])
        self.assertEqual(pq["callers"], ["CallerScript.oneffectstart -> PQScript.turn (unattached) x1"])
        self.assertEqual(pq["globals"], ["a001:Skyrim.esm PlayerIsX"])

    def test_ctda_vars_emits_the_condition_variables(self):
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(io.StringIO()):
            self.assertEqual(CV.main(["--emit"] + self.d.args()), 0)
        e = json.loads(out.getvalue())
        self.assertEqual(e["conditionVariables"], [{"form": "b001:Skyrim.esm", "script": "PQScript", "var": "::Status_var"}])
        self.assertEqual(e["census"]["keys"]["dialogue keys"], 1)
        self.assertEqual(e["census"]["unresolvedConditions"], 0)
        lo, R, Xi = self.d.load()
        rows, summary, lists, unresolved = CV.table(lo, R, Xi["scripts"])
        self.assertEqual([(r["edid"], r["entry"]) for r in rows], [("PQ", "QS")], "OnInit, the quest's own script, writes it")


if __name__ == "__main__":
    unittest.main()
