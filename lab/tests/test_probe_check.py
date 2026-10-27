"""lab/tools/probe-check.py: the checks lab-api makes only at a run's assert step, made before the run."""

import importlib.util
import unittest
from pathlib import Path

from _labapi import needs_deps

HEAD = "id: x-t\nmilestone: M3\nclients: [c1, c2]\nsteps:\n"


def _module():
    path = Path(__file__).resolve().parents[1] / "tools" / "probe-check.py"
    spec = importlib.util.spec_from_file_location("probe_check", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@needs_deps
class ProbeCheck(unittest.TestCase):
    def test_a_seats_log_count_claim_needs_the_same_pattern_counted_first(self):
        # x-npc-copy-fate 20261027-041406: the claim's "server.s" against the step's "server's"
        check = _module().check
        text = HEAD + ("  - c1: log-count {pattern: \"dressed ff[0-9a-f]+ from the server's roll\"}\n"
                       "  - assert:\n      - 'c1.log_count(\"dressed ff[0-9a-f]+ from the server.s roll\") >= 1'\n")
        findings = check(text)
        self.assertEqual(len(findings), 1, findings)
        self.assertIn("the nearest counted", findings[0])
        exact = HEAD + ("  - c1: log-count {pattern: \"dressed ff[0-9a-f]+\"}\n"
                        "  - assert:\n      - 'c1.log_count(\"dressed ff[0-9a-f]+\") >= 1'\n")
        self.assertEqual(check(exact), [])

    def test_the_servers_log_count_is_live_and_needs_no_step(self):
        check = _module().check
        text = HEAD + "  - assert:\n      - 'server.log_count(\"E_EQUIP_REFUSED: ff[0-9a-f]+\") == 0'\n"
        self.assertEqual(check(text), [])

    def test_assert_syntax_is_caught_before_a_run(self):
        # x-body-loot v3 20261027-000612: refs_near is a method
        check = _module().check
        bad = HEAD + "  - assert:\n      - c1.refs_near.count(26) >= 1\n"
        findings = check(bad)
        self.assertEqual(len(findings), 1, findings)
        self.assertIn("E_ASSERT_SYNTAX", findings[0])
        good = HEAD + "  - assert:\n      - c1.refs_near().count(26) >= 1\n"
        self.assertEqual(check(good), [])
