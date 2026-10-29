"""The game's own ini keys every seat gets (lab/layer/game-ini.tsv): rows name one of the two ini files, a section,
a key and a value, and add-mods.ps1 reads the file from the tree's root (persist-mods keeps it out of SHA256SUMS)."""
import csv
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class GameIni(unittest.TestCase):
    def rows(self):
        with open(ROOT / "lab" / "layer" / "game-ini.tsv", newline="") as f:
            return [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]

    def test_rows_are_well_formed(self):
        rs = self.rows()
        self.assertTrue(rs)
        for r in rs:
            self.assertIn(r["file"], ("Skyrim.ini", "SkyrimPrefs.ini"), r)
            self.assertRegex(r["section"], r"^[A-Za-z][A-Za-z0-9 .]*$")
            self.assertRegex(r["key"], r"^[bfiusS][A-Za-z0-9 ]+$")
            self.assertTrue(r["value"].strip() and r["why"].strip(), r)
        self.assertEqual(len({(r["file"], r["section"], r["key"]) for r in rs}), len(rs))

    def test_the_subtitle_and_kill_camera_keys_are_set(self):
        got = {(r["file"], r["section"], r["key"]): r["value"] for r in self.rows()}
        self.assertEqual(got[("SkyrimPrefs.ini", "Interface", "bGeneralSubtitles")], "1")
        self.assertEqual(got[("SkyrimPrefs.ini", "Interface", "bDialogueSubtitles")], "1")
        self.assertEqual(got[("Skyrim.ini", "VATS", "bVATSDisable")], "1")

    def test_the_installer_and_the_build_carry_the_file(self):
        ps1 = (ROOT / "lab" / "deploy" / "sky-client" / "add-mods.ps1").read_text()
        self.assertIn("game-ini.tsv", ps1)
        sh = (ROOT / "lab" / "tools" / "persist-mods.sh").read_text()
        self.assertIn('cp "$root/lab/layer/game-ini.tsv" "$stage/tree/game-ini.tsv"', sh)
        self.assertIn("! -name game-ini.tsv", sh)


if __name__ == "__main__":
    unittest.main()
