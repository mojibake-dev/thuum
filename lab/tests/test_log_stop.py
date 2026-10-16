"""lab/tools/log-stop.py (ADR-033, a game whose log stops): a seat's Skyrim Platform log stopped only when the
other seat made spell actions after its last line, which that seat's game replays and logs."""
import datetime
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("log_stop", Path(__file__).resolve().parents[1] / "tools" / "log-stop.py")
ls = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ls)

START = datetime.datetime(2026, 10, 15, 17, 50, 0).timestamp()  # a watch's start, local time


def stamp(epoch: float) -> str:
    t = datetime.datetime.fromtimestamp(epoch)
    return f"[{t:%H:%M:%S}:{t.microsecond // 1000:03d}]"


class LogStop(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="log-stop-"))

    def trace(self, name, actions=(), figure=True):
        path = self.dir / name
        path.write_text(json.dumps({"seconds": 300, "actors": [{"name": "figure"}] if figure else [],
                                    "self": {"actions": [[ms, 1, 2, n, 0] for ms, n in actions]}}))
        return path

    def cycles(self, name, *traces):
        path = self.dir / name
        path.write_text("".join(f"{k}\t{START}\t{t}\n" for k, t in traces))
        return path

    def log(self, last_s):
        path = self.dir / "c2.log"
        path.write_text(f"{stamp(START)} JsEngine::RunScript()\n{stamp(START + last_s)} Latent callback called\n")
        return path

    def judge(self, theirs_actions, figure=True, last_s=60):
        mine = self.cycles("cycles-c2.tsv", ("1", self.trace("trace-c2-1.json", figure=figure)))
        theirs = self.cycles("cycles-c1.tsv", ("1", self.trace("trace-c1-1.json", theirs_actions)))
        return ls.verdict(str(self.log(last_s)), str(mine), str(theirs), "c2", "c1")

    def test_spell_actions_after_the_last_line_are_a_finding(self):
        v = self.judge([(30_000, "MRh_SpellAimedConcentrationStart"), (90_000, "MRh_SpellAimedConcentrationStart"),
                        (91_000, "MRh_SpellRelease_Event"), (93_000, "MLh_Equipped_Event")])
        self.assertTrue(v.startswith("FINDING c2:"), v)
        self.assertIn("c1 made 3 spell actions after it", v)

    def test_a_quiet_log_is_no_finding(self):
        # the other seat turned and sneaked after the last line, and cast before it: nothing for this log
        v = self.judge([(30_000, "DualMagic_SpellAimedStart"), (90_000, "TurnLeft"), (95_000, "SneakStart")])
        self.assertIn("a quiet log, no finding", v)

    def test_the_replay_has_two_seconds(self):
        v = self.judge([(61_500, "MRh_SpellRelease_Event")])
        self.assertIn("no finding", v)

    def test_no_figure_in_this_game_is_no_finding(self):
        v = self.judge([(90_000, "MRh_SpellAimedConcentrationStart")], figure=False)
        self.assertIn("no finding", v)

    def test_a_log_without_lines(self):
        mine = self.cycles("cycles-c2.tsv", ("1", self.trace("trace-c2-1.json")))
        theirs = self.cycles("cycles-c1.tsv", ("1", self.trace("trace-c1-1.json")))
        (self.dir / "empty.log").write_text("")
        self.assertEqual(ls.verdict(str(self.dir / "empty.log"), str(mine), str(theirs), "c2", "c1"),
                         "c2: no Skyrim Platform log lines")

    def test_the_last_line_lands_on_the_anchor_s_day(self):
        # a line just before midnight read just after it belongs to the day before
        anchor = datetime.datetime(2026, 10, 16, 0, 5, 0).timestamp()
        t = ls.last_line("[23:59:58:500] x\n", anchor)
        self.assertEqual(datetime.datetime.fromtimestamp(t), datetime.datetime(2026, 10, 15, 23, 59, 58, 500000))


if __name__ == "__main__":
    unittest.main()
