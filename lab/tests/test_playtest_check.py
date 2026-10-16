"""lab/tools/playtest-check.py (ADR-033, decision 2): every checklist item names its scenario, or says the
lab cannot measure it."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("playtest_check", Path(__file__).resolve().parents[1] / "tools" / "playtest-check.py")
pc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pc)

CHECKLIST = """# thuum playtest twenty

## 1. The hands

- [ ] Test 1 holds Flames at test 2 a few times, at a person's rhythm:
      every cast shows whole (`b-cast-rhythm`).
  - NOTE: Eli's note under the item, `b-not-a-scenario` here is not counted.
- [x] Both hands casting Flames separately (`b-cast-both-hands`, `b-spell`).
- [ ] Does the fire look right from the other seat? (feel)
- [ ] Firebolt from the left hand at test 2.
- [ ] Write it here. (no scenario: notes)
- [ ] A swing and a block as before (`b-duel`, `b-missing`).
"""


class PlaytestCheck(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="pt-check-"))
        for sid in ("b-cast-rhythm", "b-cast-both-hands", "b-spell", "b-duel"):
            (self.dir / f"{sid}.yaml").write_text("id: " + sid + "\n")

    def test_items_and_their_continuations(self):
        found = pc.items(CHECKLIST)
        self.assertEqual([no for no, _ in found], [5, 8, 9, 10, 11, 12])
        self.assertIn("`b-cast-rhythm`", found[0][1])
        self.assertNotIn("b-not-a-scenario", found[0][1])

    def test_what_the_check_reports(self):
        problems, named = pc.check(CHECKLIST, self.dir)
        self.assertEqual(named, ["b-cast-rhythm", "b-cast-both-hands", "b-spell", "b-duel"])
        self.assertEqual(len(problems), 2, problems)
        self.assertTrue(any(p.startswith("line 10: no scenario named") for p in problems))
        self.assertTrue(any("`b-missing` is not a committed scenario" in p for p in problems))

    def test_a_covered_checklist_has_no_problems(self):
        text = CHECKLIST.replace("- [ ] Firebolt from the left hand at test 2.", "- [ ] Firebolt from the left hand (`b-spell`).")
        text = text.replace(", `b-missing`", "")
        self.assertEqual(pc.check(text, self.dir)[0], [])


if __name__ == "__main__":
    unittest.main()
