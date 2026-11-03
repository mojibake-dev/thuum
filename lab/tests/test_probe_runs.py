"""lab/tools/probe-runs.py (the root-cause plan after playtest 41, W5; ADR-064's consequences): a verb doc naming a probe
by path that no lab run played refuses the merge; the docs are the ones naming the merge's scenarios."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("probe_runs", Path(__file__).resolve().parents[1] / "tools" / "probe-runs.py")
pr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pr)

LISTING = """<a href="./20261103-073235-x-script-natives/">x</a> <a href="./20261102-052100-b-npc-handoff-door-hosts/">y</a>
<a href="../">up</a> <a href="./screenshots/">not a run</a>"""


class ProbeRunsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def doc(self, name: str, text: str) -> Path:
        p = self.dir / f"{name}.md"
        p.write_text(text, encoding="utf-8")
        return p

    def test_the_listing_reads_scenario_ids(self):
        self.assertEqual(pr.played_ids(LISTING), {"x-script-natives", "b-npc-handoff-door-hosts"})

    def test_an_unrun_probe_by_path_is_named_once(self):
        d = self.doc("v", "Probe x-script-natives by path (20261103-073235).\n"
                          "x-never-run v2 by path, then x-never-run v3 by path.\n"
                          "x-mentioned-only is no promise of a run.\n"
                          "HYPOTHESIS until x-hide-probe (by path): the second form.\n"
                          "None has been written by path or run as of 2026-10-29: x-inventory-only, a list of absent probes.\n")
        self.assertEqual(pr.unrun(d, pr.played_ids(LISTING)), ["x-never-run", "x-hide-probe"])

    def test_docs_are_the_ones_naming_the_scenarios(self):
        a = self.doc("a", "Scenario: b-npc-handoff-door-hosts.\n")
        self.doc("b", "Scenario: b-npc-handoff-door-hosts-swap.\n")  # a longer id is another scenario
        self.doc("c", "nothing here\n")
        self.assertEqual(pr.docs_naming(["b-npc-handoff-door-hosts"], self.dir), [a])
        self.assertEqual(pr.docs_naming([], self.dir), [])


if __name__ == "__main__":
    unittest.main()
