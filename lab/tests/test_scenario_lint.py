"""lab/tools/scenario-lint.py (the root-cause plan after playtest 41, W4; ADR-064 decision 3): a claim that cannot
fail, a relaunch premise the deploy lacks, and a ticked verb whose two-seat scenario leaves a seat out are refused."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

from _labapi import ROOT, needs_deps

HEAD = """id: {id}
clients: [c1, c2]
steps:
  - c1: connect
  - c2: connect
"""

DOC = """# Verb: {name}

## Ownership

Two seats: {two}

## Status

- [x] doc complete
- [{t3}] T3 scenario green, no HYPOTHESIS tags
"""


def _lint():
    spec = importlib.util.spec_from_file_location("scenario_lint", ROOT / "lab" / "tools" / "scenario-lint.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@needs_deps
class ScenarioLintTest(unittest.TestCase):
    def setUp(self):
        self.sl = _lint()
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def scenario(self, body: str, id: str = "b-lint-case") -> Path:
        p = self.dir / f"{id}.yaml"
        p.write_text(HEAD.format(id=id) + body, encoding="utf-8")
        return p

    def claim(self, expr: str) -> list[str]:
        return self.sl.lint_scenario(self.scenario(f"  - assert:\n      - {expr}\n"))

    def test_a_count_at_least_zero_cannot_fail(self):
        for expr in ('c1.log_count("census") >= 0', "server.log_count('E_X') > -1", "0 <= c2.count('0x12eb7')",
                     'c1.log_count("a") >= 0 or c2.log_count("b") == 1'):
            with self.subTest(expr=expr):
                self.assertEqual(len(self.claim(expr)), 1, expr)

    def test_claims_that_can_fail_pass(self):
        for expr in ("server.actor(c1).y > -346", 'c1.log_count("census") >= 1', '0 <= c1.log_count("pass") <= 6',
                     'c1.log_count("a") >= 0 and c2.log_count("b") == 1', "c2.view(c1).health >= 0"):
            with self.subTest(expr=expr):
                self.assertEqual(self.claim(expr), [], expr)

    def relaunch(self, change: str, id: str = "b-lint-case") -> list[str]:
        return self.sl.lint_scenario(self.scenario(f"  - c1: relaunch {{until: gone, files: [{change}]}}\n", id))

    def test_a_switch_and_the_plumbing_pass(self):
        for change in ('{json: "Data/Platform/Plugins/skymp5-client-settings.txt", key: "propPhysics", value: false}',
                       '{json: "Data/Platform/Plugins/skymp5-client-settings.txt", key: "cellHost", value: true}',
                       '{json: Data/Platform/Plugins/skymp5-client-settings.txt, key: server-port, value: 1}'):
            with self.subTest(change=change):
                self.assertEqual(self.relaunch(change), [])

    def test_a_premise_the_deploy_lacks_is_refused(self):
        for change in ('{json: "Data/Platform/Plugins/skymp5-client-settings.txt", key: "activationUnblockedBases", value: "1a4bb"}',
                       '{json: "Data/Platform/Plugins/skymp5-client-settings.txt", key: "propPhysics", value: "on"}',
                       '{ini: "Skyrim.ini", section: Display, key: iVSyncPresentInterval, value: 0}',
                       '{rename: "Data/SKSE/Plugins/FSMP.dll", to: "FSMP.dll.off"}'):
            with self.subTest(change=change):
                self.assertEqual(len(self.relaunch(change)), 1, change)

    def test_the_baseline_holds_its_named_scenarios_only(self):
        key = '{json: "Data/Platform/Plugins/skymp5-client-settings.txt", key: "activationUnblockedBases", value: "1a4bb"}'
        self.assertEqual(self.relaunch(key, "b-bleak-traps"), [])
        self.assertEqual(len(self.relaunch(key, "b-bleak-traps-two")), 1)

    def doc(self, two: str, t3: str = "x", name: str = "lint-verb") -> Path:
        p = self.dir / f"{name}.md"
        p.write_text(DOC.format(name=name, two=two, t3=t3), encoding="utf-8")
        return p

    def test_a_ticked_verb_names_a_scenario_both_seats_play(self):
        self.scenario("  - c1: activate {ref: 0x1}\n  - c2: activate {ref: 0x1}\n"
                      "  - assert:\n      - c1.view(c2).y > 0\n      - c2.view(c1).y > 0\n", "b-lint-both")
        self.assertEqual(self.sl.lint_two_seats(self.doc("b-lint-both, both seats open it"), self.dir), [])

    def test_a_seat_left_out_is_refused(self):
        self.scenario("  - c1: activate {ref: 0x1}\n  - assert:\n      - c1.view(c2).y > 0\n", "b-lint-one")
        out = self.sl.lint_two_seats(self.doc("b-lint-one"), self.dir)
        self.assertEqual(len(out), 2, out)  # c2 has no claim from its own game and no action of its own

    def test_missing_unnamed_none_and_unticked(self):
        self.assertEqual(len(self.sl.lint_two_seats(self.doc("b-lint-absent"), self.dir)), 1)
        self.assertEqual(len(self.sl.lint_two_seats(self.doc("<the committed scenario>"), self.dir)), 1)
        self.assertEqual(self.sl.lint_two_seats(self.doc("none, the favorites bar is the player's own (R3)"), self.dir), [])
        self.assertEqual(len(self.sl.lint_two_seats(self.doc("none"), self.dir)), 1)  # none needs its reason
        self.assertEqual(self.sl.lint_two_seats(self.doc("b-lint-absent", t3=" "), self.dir), [])

    def test_the_repo_holds_the_contract(self):
        self.assertEqual(self.sl.main([]), 0)


if __name__ == "__main__":
    unittest.main()
