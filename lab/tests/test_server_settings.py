"""The server's settings per game version (ADR-025): the two files differ only
in their load order, 1.7.104's is 1.6.1170's without RaceMenu's plugins, and
both end with the mod layer's plugins in persist-mods.sh's order, which is the
order the clones' plugins.txt enables them in (add-mods.ps1)."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRV = ROOT / "lab" / "deploy" / "sky-srv"
RACEMENU = ["RaceMenu.esp", "RaceMenuPlugin.esp"]
# the mod layer's plugins that stay on the clients (persist-mods.sh): CBBE's
# light plugin and the one that only drives RaceMenu's sliders, each the last
# of its kind on the clients and named by no server state; they close the
# clients' load order
CLIENT_ONLY = ["RaceMenuMorphsCBBE.esp", "CBBE.esp"]
# the light plugins the server loads, in the order the clones' engine
# numbers them (x-light-probe, run 20261008-101512: Skyrim.ccc's order;
# docs/verbs/light-plugins.md)
LIGHT = ["ccQDRSSE001-SurvivalMode.esl", "ccBGSSSE037-Curios.esl", "_ResourcePack.esl"]


def load(name):
    return json.loads((SRV / name).read_text())


def names(settings):
    return [Path(p).name for p in settings["loadOrder"]]


class ServerSettings(unittest.TestCase):
    def setUp(self):
        self.main = load("server-settings.json")
        self.old = load("server-settings-1.7.104.json")

    def test_only_the_load_order_differs(self):
        a = {k: v for k, v in self.main.items() if k != "loadOrder"}
        b = {k: v for k, v in self.old.items() if k != "loadOrder"}
        self.assertEqual(a, b)

    def test_1_7_104_is_1_6_1170_without_racemenu(self):
        self.assertEqual(names(self.old), [n for n in names(self.main) if n not in RACEMENU])
        for n in RACEMENU:
            self.assertIn(n, names(self.main))

    def test_the_mod_layer_closes_the_load_order_in_its_own_order(self):
        script = (ROOT / "lab" / "tools" / "persist-mods.sh").read_text()
        plugins = re.search(r"^plugins=\(([^)]*)\)", script, re.M).group(1).split()
        self.assertEqual(plugins[-len(CLIENT_ONLY):], CLIENT_ONLY)
        served = plugins[: -len(CLIENT_ONLY)]
        self.assertEqual(names(self.main)[-len(served):], served)
        for n in CLIENT_ONLY:
            self.assertNotIn(n, names(self.main))
            self.assertNotIn(n, names(self.old))

    def test_light_plugins_load_in_the_engine_s_order(self):
        for settings in (self.main, self.old):
            light = [n for n in names(settings) if n.lower().endswith(".esl")]
            self.assertEqual(light, LIGHT)
            # each between the full plugins Skyrim.ccc puts around it
            order = names(settings)
            self.assertLess(order.index("ccBGSSSE001-Fish.esm"), order.index("ccQDRSSE001-SurvivalMode.esl"))
            self.assertLess(order.index("ccBGSSSE037-Curios.esl"), order.index("ccBGSSSE025-AdvDSGS.esm"))
            self.assertLess(order.index("ccBGSSSE025-AdvDSGS.esm"), order.index("_ResourcePack.esl"))
            self.assertLess(order.index("_ResourcePack.esl"), order.index("RaceCompatibility.esm"))


if __name__ == "__main__":
    unittest.main()
