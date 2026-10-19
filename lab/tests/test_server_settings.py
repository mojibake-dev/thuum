"""The server's settings per game version (ADR-025) and the mod layer's load order
(lab/layer/load-order.tsv, docs/MODS.md): the two settings files differ only in
their load order, 1.7.104's is 1.6.1170's without the plugins of mods scoped to
1.6.1170 (<mod>@1.6.1170: RaceMenu's, CBBE's, and the essentials layer's DLL mods),
both end with the layer's served plugins in the manifest's order, persist-mods.sh
enables the same plugins in the same order on the clones (add-mods.ps1) with the
client-only ones last, and lab/tools/layer-render.py finds nothing to rewrite."""
import csv
import json
import re
import shlex
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRV = ROOT / "lab" / "deploy" / "sky-srv"
TSV = ROOT / "lab" / "layer" / "load-order.tsv"
# the light plugins before the layer, in the order the clones' engine numbers
# them (x-light-probe, run 20261008-101512: Skyrim.ccc's order;
# docs/verbs/light-plugins.md); the layer's light ones follow in its order
CC_LIGHT = ["ccQDRSSE001-SurvivalMode.esl", "ccBGSSSE037-Curios.esl", "_ResourcePack.esl"]


def load(name):
    return json.loads((SRV / name).read_text())


def names(settings):
    return [Path(p).name for p in settings["loadOrder"]]


def order():
    with open(TSV, newline="") as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]


class ServerSettings(unittest.TestCase):
    def setUp(self):
        self.main = load("server-settings.json")
        self.old = load("server-settings-1.7.104.json")
        self.order = order()
        self.served = [r for r in self.order if r["server"] == "yes"]
        self.client_only = [r for r in self.order if r["server"] == "client-only"]

    def test_only_the_load_order_differs(self):
        a = {k: v for k, v in self.main.items() if k != "loadOrder"}
        b = {k: v for k, v in self.old.items() if k != "loadOrder"}
        self.assertEqual(a, b)

    def test_the_manifest_is_one_plugin_per_row_with_the_client_only_ones_last(self):
        plugins = [r["plugin"] for r in self.order]
        self.assertEqual(len(plugins), len(set(plugins)))
        self.assertEqual([int(r["order"]) for r in self.order], list(range(1, len(self.order) + 1)))
        self.assertEqual(self.order[: len(self.served)], self.served)
        for r in self.order:
            self.assertIn(r["server"], ("yes", "client-only"))
            self.assertIn(r["light"], ("full", "light"))
            self.assertIn(r["versions"], ("all", "1.6.1170"))
            if r["versions"] != "all":
                self.assertTrue(r["mod"].endswith("@" + r["versions"]), r)
        # the two that close the clients' order today (docs/MODS.md: CBBE's pair)
        self.assertEqual(plugins[-2:], ["RaceMenuMorphsCBBE.esp", "CBBE.esp"])

    def test_1_6_1170_serves_every_version_s_plugins_and_1_7_104_only_the_unscoped(self):
        self.assertEqual(names(self.main)[-len(self.served):], [r["plugin"] for r in self.served])
        old_served = [r["plugin"] for r in self.served if r["versions"] == "all"]
        self.assertEqual(names(self.old)[-len(old_served):], old_served)
        self.assertEqual(names(self.old), [n for n in names(self.main) if n in old_served or n not in {r["plugin"] for r in self.served}])
        for r in self.client_only:
            self.assertNotIn(r["plugin"], names(self.main))
            self.assertNotIn(r["plugin"], names(self.old))

    def test_persist_mods_enables_the_manifest_s_order(self):
        script = (ROOT / "lab" / "tools" / "persist-mods.sh").read_text()
        # shell words: a plugin's name may hold spaces, quoted (Apocalypse's)
        plugins = shlex.split(re.search(r"^plugins=\(([^)]*)\)", script, re.M).group(1))
        self.assertEqual(plugins, [r["plugin"] for r in self.order])

    def test_light_plugins_load_in_the_engine_s_order(self):
        for settings, version in ((self.main, "1.6.1170"), (self.old, "1.7.104")):
            light_served = [r["plugin"] for r in self.served if r["light"] == "light" and r["versions"] in ("all", version)]
            light = [n for n in names(settings) if n.lower().endswith(".esl") or n in light_served]
            self.assertEqual(light, CC_LIGHT + light_served)
            # each Creation Club light plugin between the full plugins Skyrim.ccc puts around it
            o = names(settings)
            self.assertLess(o.index("ccBGSSSE001-Fish.esm"), o.index("ccQDRSSE001-SurvivalMode.esl"))
            self.assertLess(o.index("ccBGSSSE037-Curios.esl"), o.index("ccBGSSSE025-AdvDSGS.esm"))
            self.assertLess(o.index("ccBGSSSE025-AdvDSGS.esm"), o.index("_ResourcePack.esl"))
            self.assertLess(o.index("_ResourcePack.esl"), o.index(self.served[0]["plugin"]))

    def test_the_render_has_nothing_to_rewrite(self):
        r = subprocess.run([sys.executable, str(ROOT / "lab" / "tools" / "layer-render.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_every_manifest_mod_folder_with_plugins_is_in_the_load_order(self):
        with open(ROOT / "lab" / "layer" / "essentials.tsv", newline="") as f:
            mods = [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]
        in_order = {(r["mod"], r["plugin"]) for r in self.order}
        for m in mods:
            if m["source"] == "out":
                continue
            for p in filter(None, m["plugins"].split(";")):
                self.assertIn((m["folder"], p), in_order, f"{m['folder']} ships {p}, which load-order.tsv lacks")
        folders = {m["folder"] for m in mods if m["source"] != "out"}
        legacy = {"racecompatibility-2.16", "rotfern", "racemenu-0.4.20.0@1.6.1170", "lostgrimoire-1.6", "apocalypse-10.2.3",
                  "headshotkills-1.2", "cbbe-2.0.3@1.6.1170"}
        for r in self.order:
            self.assertIn(r["mod"], folders | legacy, r)


if __name__ == "__main__":
    unittest.main()
