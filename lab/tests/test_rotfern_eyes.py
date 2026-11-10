"""RotfernEyes.esp (thuum D-E1): the plugin lab/rotfern-eyes/build_esp.py writes, read back field by field, and the script's
declared properties matched against the plugin's, so the two can never drift apart."""
import importlib.util
import re
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("build_esp", ROOT / "lab" / "rotfern-eyes" / "build_esp.py")
build_esp = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_esp)
PSC = ROOT / "lab" / "rotfern-eyes" / "src" / "RotfernEyesAlias.psc"


def fields(data: bytes) -> list[tuple[str, bytes]]:
    out, o = [], 0
    while o < len(data):
        kind = data[o:o + 4].decode("ascii")
        (size,) = struct.unpack_from("<H", data, o + 4)
        out.append((kind, data[o + 6:o + 6 + size]))
        o += 6 + size
    return out


def wstring(data: bytes, o: int) -> tuple[str, int]:
    (n,) = struct.unpack_from("<H", data, o)
    return data[o + 2:o + 2 + n].decode("ascii"), o + 2 + n


class RotfernEyesPlugin(unittest.TestCase):
    def setUp(self) -> None:
        self.data = build_esp.build()

    def test_same_bytes_every_build(self) -> None:
        self.assertEqual(self.data, build_esp.build())

    def test_header_is_light_with_its_masters(self) -> None:
        self.assertEqual(self.data[:4], b"TES4")
        size, flags = struct.unpack_from("<II", self.data, 4)
        self.assertEqual(flags & 0x200, 0x200)
        head = fields(self.data[24:24 + size])
        self.assertEqual([d.rstrip(b"\0").decode() for k, d in head if k == "MAST"], ["Skyrim.esm", "Dragonborn.esm", "rotfern.esp"])
        version, count, next_id = struct.unpack("<fII", dict(head)["HEDR"])
        self.assertAlmostEqual(version, 1.7, places=5)
        self.assertEqual((count, next_id), (2, 0x801))

    def quest_fields(self) -> tuple[int, list[tuple[str, bytes]]]:
        (hsize,) = struct.unpack_from("<I", self.data, 4)
        o = 24 + hsize
        self.assertEqual(self.data[o:o + 4], b"GRUP")
        (gsize,) = struct.unpack_from("<I", self.data, o + 4)
        self.assertEqual(self.data[o + 8:o + 12], b"QUST")
        self.assertEqual(o + gsize, len(self.data))
        r = o + 24
        self.assertEqual(self.data[r:r + 4], b"QUST")
        size, flags, form_id, _ts, _vc, version, _unk = struct.unpack_from("<IIIHHHH", self.data, r + 4)
        self.assertEqual(version, 44)
        self.assertEqual(r + 24 + size, len(self.data))
        return form_id, fields(self.data[r + 24:r + 24 + size])

    def test_quest_starts_with_the_game_and_aliases_the_player(self) -> None:
        form_id, f = self.quest_fields()
        self.assertEqual(form_id, 0x03000800)
        d = dict(f)
        self.assertEqual(d["EDID"], b"RotfernEyesQuest\0")
        flags = struct.unpack_from("<H", d["DNAM"])[0]
        self.assertTrue(flags & 0x0001, "start game enabled")
        self.assertEqual(d["ALID"], b"Player\0")
        self.assertEqual(struct.unpack("<I", d["ALUA"])[0], 0x00000007)
        kinds = [k for k, _ in f]
        self.assertEqual(kinds[kinds.index("NEXT"):], ["NEXT", "ANAM", "ALST", "ALID", "FNAM", "ALUA", "VTCK", "ALED"])

    def test_the_alias_script_and_its_properties(self) -> None:
        _form_id, f = self.quest_fields()
        v = dict(f)["VMAD"]
        version, objfmt, quest_scripts = struct.unpack_from("<hhH", v, 0)
        self.assertEqual((version, objfmt, quest_scripts), (5, 2, 0))
        o = 6
        self.assertEqual(v[o], 2)
        (fragments,) = struct.unpack_from("<H", v, o + 1)
        self.assertEqual(fragments, 0)
        name, o = wstring(v, o + 3)
        self.assertEqual(name, "")
        (aliases,) = struct.unpack_from("<H", v, o)
        self.assertEqual(aliases, 1)
        _unused, alias, owner = struct.unpack_from("<HhI", v, o + 2)
        self.assertEqual((alias, owner), (0, 0x03000800))
        version, objfmt, scripts = struct.unpack_from("<hhH", v, o + 10)
        self.assertEqual((version, objfmt, scripts), (5, 2, 1))
        script, o = wstring(v, o + 16)
        self.assertEqual(script, "RotfernEyesAlias")
        status, count = v[o], struct.unpack_from("<H", v, o + 1)[0]
        self.assertEqual(status, 0)
        o += 3
        props = {}
        for _ in range(count):
            pname, o = wstring(v, o)
            ptype, pstatus = v[o], v[o + 1]
            _u, palias, pform = struct.unpack_from("<HhI", v, o + 2)
            self.assertEqual((ptype, pstatus, palias), (1, 1, -1))
            props[pname] = pform
            o += 10  # type, status and the 8-byte object
        self.assertEqual(o, len(v))
        self.assertEqual(props, {
            "RotfernRace": 0x0200AA00, "RotfernRaceVampire": 0x02019D08,
            "RotfernEyes": 0x02014C06, "RotfernEyesVampire": 0x02019D09,
            "RotfernEyesMora": 0x02023F0E, "RotfernEyesMoraVampire": 0x02023F0F,
            "DLC2MQ06": 0x010179D7,
        })

    def test_the_script_declares_exactly_the_plugins_properties(self) -> None:
        text = PSC.read_text()
        self.assertRegex(text, r"(?m)^ScriptName RotfernEyesAlias extends ReferenceAlias\b")
        declared = re.findall(r"(?m)^\w+ Property (\w+) Auto\b", text)
        self.assertEqual(sorted(declared), sorted(name for name, _ in build_esp.PROPERTIES))


if __name__ == "__main__":
    unittest.main()
