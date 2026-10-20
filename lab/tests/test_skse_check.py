"""lab/tools/skse-check.py: SKSE's per-DLL lines as the essentials layer's seats wrote them (run
20261019-232144-smoke-two-players): a name with spaces, a version block whose name holds parentheses, and a
DLL that is not an SKSE plugin."""
import importlib.util
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("skse_check", Path(__file__).resolve().parents[1] / "tools" / "skse-check.py")
sc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sc)

LOG = """SKSE64 runtime: initialize (version = 2.2.6 01064920 01DD6020B8C1D403, os = 6.2 (9200))
checking plugin AchievementsModsEnablerLoader.dll
checking plugin Fuz Ro D'oh.dll
checking plugin msdia140.dll
plugin msdia140.dll (00000000  00000000) no version data 0 (handle 0)
checking plugin po3_Tweaks.dll
plugin AchievementsModsEnablerLoader.dll (00000001 Achievements Mods Enabler Loader (SKSE64, AE) 00000001) loaded correctly (handle 1)
plugin Fuz Ro D'oh.dll (00000001 Fuz Ro D'oh 02050008) loaded correctly (handle 2)
couldn't load plugin po3_Tweaks.dll (Address Library for SKSE Plugins does not have the version)
"""


class SkseCheck(unittest.TestCase):
    def test_each_line_shape(self):
        checked, verdict, runtime = sc.check(LOG)
        self.assertEqual(checked, ["AchievementsModsEnablerLoader.dll", "Fuz Ro D'oh.dll", "msdia140.dll", "po3_Tweaks.dll"])
        self.assertEqual(verdict["AchievementsModsEnablerLoader.dll"], "loaded correctly (handle 1)")
        self.assertEqual(verdict["Fuz Ro D'oh.dll"], "loaded correctly (handle 2)")
        self.assertEqual(verdict["msdia140.dll"], "no version data 0 (handle 0)")
        self.assertTrue(verdict["po3_Tweaks.dll"].startswith("couldn't load (Address Library"))
        self.assertEqual(runtime, "SKSE 2.2.6, game 1.6.1170")

    def test_the_dia_sdk_is_not_an_skse_plugin(self):
        self.assertIn("msdia140.dll", sc.NOT_SKSE)


if __name__ == "__main__":
    unittest.main()
