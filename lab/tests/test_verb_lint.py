"""lab/tools/verb-lint.py (the root-cause plan after playtest 41, W5): a T3 box ticked over an open engine claim
fails, whatever the box's wording; a decompiler read called CONFIRMED-STATIC counts as open."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("verb_lint", Path(__file__).resolve().parents[1] / "tools" / "verb-lint.py")
vl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vl)

DOC = """# Verb: {name}

## Engine surface

- {claim}

## Status

- [x] doc complete
- [{t3}] {box}
"""


class VerbLintTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, name, claim, t3, box="T3 scenario green, no HYPOTHESIS tags"):
        (self.root / f"{name}.md").write_text(DOC.format(name=name, claim=claim, t3=t3, box=box), encoding="utf-8")

    def test_a_ticked_box_over_a_hypothesis_fails(self):
        self.write("a", "the engine plays no sound on KillSilent: HYPOTHESIS", "x")
        bad = vl.lint(self.root)
        self.assertEqual(len(bad), 1)
        self.assertIn("a.md:10", bad[0])

    def test_the_box_wording_does_not_matter(self):
        self.write("b", "the hook fires once: HYPOTHESIS", "x", box="T3 scenario green")
        self.assertEqual(len(vl.lint(self.root)), 1)

    def test_a_decompiler_read_counts_as_open(self):
        self.write("c", "KillImpl hands the ragdoll to Havok: CONFIRMED-STATIC (Ghidra)", "x")
        self.assertEqual(len(vl.lint(self.root)), 1)

    def test_a_settled_claim_and_an_unticked_box_pass(self):
        self.write("d", "the hook fires once: HYPOTHESIS, CONFIRMED by x-hook 20261102-131634", "x")
        self.write("e", "the hook fires once: HYPOTHESIS", " ")
        self.assertEqual(vl.lint(self.root), [])

    def test_a_cited_run_or_a_lowercase_confirmed_settles_a_line(self):
        self.write("f", "the order, HYPOTHESIS until x-light-probe 20261008-101512 settled it", "x")
        self.write("g", "HYPOTHESIS confirmed by the tcl probe", "x")
        self.assertEqual(vl.lint(self.root), [])


if __name__ == "__main__":
    unittest.main()
