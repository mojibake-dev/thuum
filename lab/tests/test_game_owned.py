"""Files the game owns after their first lay (lab/layer/game-owned.tsv; numidium, 2026-11-10): rows name a file of a
manifest folder, as SHA256SUMS names it, with a why; persist-mods puts the table at the tree's root outside SHA256SUMS,
and add-mods.ps1 lays a listed file again only when the layer's copy changed since the clone's last lay (its record)."""
import csv
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def rows(path):
    with open(path, newline="") as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]


class GameOwned(unittest.TestCase):
    def test_rows_name_a_manifest_file_and_why(self):
        folders = {r["folder"] for r in rows(ROOT / "lab" / "layer" / "essentials.tsv") if r["source"] != "out"}
        rs = rows(ROOT / "lab" / "layer" / "game-owned.tsv")
        self.assertTrue(rs)
        for r in rs:
            folder, _, inside = r["path"].partition("/")
            self.assertIn(folder, folders, r["path"])
            self.assertTrue(inside and not inside.startswith("/") and "\\" not in inside, r["path"])
            self.assertTrue(r["why"].strip(), r["path"])
        self.assertEqual(len({r["path"].lower() for r in rs}), len(rs))

    def test_the_build_carries_the_file_outside_the_sums(self):
        sh = (ROOT / "lab" / "tools" / "persist-mods.sh").read_text()
        self.assertIn('cp "$root/lab/layer/game-owned.tsv" "$stage/tree/game-owned.tsv"', sh)
        self.assertIn("! -name game-owned.tsv", sh)

    def test_the_lay_judges_an_owned_file_against_its_last_lay(self):
        ps1 = (ROOT / "lab" / "deploy" / "sky-client" / "add-mods.ps1").read_text()
        self.assertIn('"$From/game-owned.tsv"', ps1)
        self.assertIn("owned = 0;", ps1)
        # the record is read before this lay writes its own, and the rule comes after the hash check that keeps a file
        self.assertLess(ps1.index("$lastLaid[$_.Substring(64)"), ps1.index("[IO.File]::WriteAllLines($record"))
        kept = ps1.index("{ $r.kept++; continue }")
        rule = ps1.index("if ($owned.ContainsKey($key) -and (Test-Path $dest) -and $lastLaid[$key] -eq $e.Hash) { $r.owned++; continue }")
        self.assertLess(kept, rule)
        self.assertLess(rule, ps1.index("& curl.exe -sS -f -o $dest $url"))


if __name__ == "__main__":
    unittest.main()
