"""lab/status.py's state word (ADR-064 decision 5): a verb is MECHANISM ONLY unless its doc's "Play:" line says BROKEN, or
says VERIFIED IN PLAY and cites the playtest or a two-seat run; every box ticked is still MECHANISM ONLY."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("status", Path(__file__).resolve().parents[1] / "status.py")
st = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(st)


class StatusWordTest(unittest.TestCase):
    def test_the_play_line_decides(self):
        for play, word in (("", "MECHANISM ONLY"),
                           ("Play: VERIFIED IN PLAY, playtest 41 (2026-11-02): both players saw the body stay down", "VERIFIED IN PLAY"),
                           ("Play: VERIFIED IN PLAY by b-prop-arbitration 20261103-075626", "VERIFIED IN PLAY"),
                           ("Play: VERIFIED IN PLAY", "MECHANISM ONLY"),  # no playtest, no run: no evidence
                           ("Play: BROKEN, playtest 41: the carried bucket shows on no other screen", "BROKEN"),
                           ("Play: VERIFIED IN PLAY at playtest 40, BROKEN at playtest 41", "BROKEN"),
                           ("Play: <VERIFIED IN PLAY, with the playtest | BROKEN, with the finding> (absent: MECHANISM ONLY)",
                            "MECHANISM ONLY")):  # VERB.md's placeholder as /verb scaffolds it
            with self.subTest(play=play):
                self.assertEqual(st.play_state(f"# Verb: x\n\n## Status\n\n- [x] T3 scenario green\n{play}\n"), word)

    def test_every_box_ticked_is_no_verdict(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "v.md"
            p.write_text("# Verb: v\n\n## Status\n\n- [x] doc complete\n- [x] T3 scenario green\n", encoding="utf-8")
            row = st.read_verb(p)
            self.assertEqual((row["ticked"], row["total"], row["state"]), (2, 2, "MECHANISM ONLY"))
            self.assertNotIn("DONE", st.table([row]))


if __name__ == "__main__":
    unittest.main()
