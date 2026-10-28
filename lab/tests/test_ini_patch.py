"""The layer's ini deltas (lab/layer/ini-patches.tsv, lab/tools/ini-patch.py): every row names a folder of the
manifest and a non-empty why; the patcher rewrites a key in its section keeping the byte order mark, the line endings
and every other line, appends a key the section lacks, refuses a section the file lacks, and is idempotent."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("ini_patch", ROOT / "lab" / "tools" / "ini-patch.py")
ini_patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ini_patch)

INI = "# header\n[UNPAUSED_MENUS]\nbBarterMenu = true\nbConsole = true\n\n[MESSAGES]\n# comment\nbHideEngineFixesWarning = false\n\n[BLUR]\nbDisableBlur = false\n"


def rows(path):
    with open(path, newline="") as f:
        return [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]


class Rows(unittest.TestCase):
    def test_every_row_names_a_manifest_folder(self):
        folders = {r["folder"] for r in rows(ROOT / "lab" / "layer" / "essentials.tsv") if r["source"] != "out"}
        patches = rows(ROOT / "lab" / "layer" / "ini-patches.tsv")
        self.assertTrue(patches)
        for r in patches:
            self.assertIn(r["folder"], folders, r["folder"])
            for k in ("file", "section", "key", "value", "why"):
                self.assertTrue(r[k].strip(), (r["folder"], k))


class Patch(unittest.TestCase):
    def test_rewrites_a_key_in_its_section_only(self):
        new, what = ini_patch.patch(INI, "UNPAUSED_MENUS", "bconsole", "false")
        self.assertEqual(new, INI.replace("bConsole = true", "bconsole = false"))
        self.assertIn("(was true)", what)
        self.assertEqual(ini_patch.patch(new, "UNPAUSED_MENUS", "bconsole", "false"), (new, "bconsole = false already"))

    def test_appends_a_missing_key_before_the_section_s_blank_line(self):
        new, what = ini_patch.patch(INI, "MESSAGES", "bNewKey", "1")
        self.assertIn("bHideEngineFixesWarning = false\nbNewKey = 1\n\n[BLUR]", new)
        self.assertIn("added to [MESSAGES]", what)

    def test_refuses_a_missing_section(self):
        with self.assertRaises(SystemExit):
            ini_patch.patch(INI, "NOPE", "a", "b")

    def test_keeps_the_bom_and_crlf(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m" / "SKSE" / "Plugins" / "x.ini"
            p.parent.mkdir(parents=True)
            p.write_bytes(b"\xef\xbb\xbf" + INI.replace("\n", "\r\n").encode())
            tsv = Path(d) / "rows.tsv"
            tsv.write_text("folder\tfile\tsection\tkey\tvalue\twhy\nm\tSKSE/Plugins/x.ini\tMESSAGES\tbHideEngineFixesWarning\ttrue\tbecause\n")
            import subprocess, sys
            out = subprocess.run([sys.executable, str(ROOT / "lab" / "tools" / "ini-patch.py"), str(tsv), d], capture_output=True, text=True)
            self.assertEqual(out.returncode, 0, out.stderr)
            raw = p.read_bytes()
            self.assertTrue(raw.startswith(b"\xef\xbb\xbf"))
            self.assertIn(b"bHideEngineFixesWarning = true\r\n", raw)
            self.assertNotIn(b"\n\n", raw.replace(b"\r\n", b""))  # no bare newlines slipped in


if __name__ == "__main__":
    unittest.main()
