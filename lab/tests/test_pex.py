"""lab/pex.py against the fork's own TESModPlatform.pex (Creation Kit output)."""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))

import pex  # noqa: E402

PEX = ROOT / "skymp/skyrim-platform/src/platform_se/pex/TESModPlatform.pex"


@unittest.skipUnless(PEX.exists(), "the skymp submodule is not checked out")
class PexTests(unittest.TestCase):
    def setUp(self):
        self.data = PEX.read_bytes()

    def test_the_creation_kit_s_output_round_trips_byte_for_byte(self):
        p = pex.parse(self.data)
        self.assertEqual(pex.write(p), self.data)
        names = [p.string(n) for o in p.objects for st in o.states for n, _ in st.functions]
        self.assertIn("CloseMenu", names)
        self.assertIn("GotoState", names)  # has instructions, with variable arguments

    def test_a_declared_native_is_global_native_and_in_the_debug_info(self):
        p = pex.parse(self.data)
        before = len(p.strings)
        pex.add_native(p, "TESModPlatform", "SetTestThing", "None", [("amount", "Float")])
        again = pex.parse(pex.write(p))
        st = again.objects[0].states[0]
        fn = {again.string(n): f for n, f in st.functions}["SetTestThing"]
        self.assertEqual(fn.flags, pex.FLAG_GLOBAL | pex.FLAG_NATIVE)
        self.assertEqual([(again.string(n), again.string(t)) for n, t in fn.params], [("amount", "Float")])
        self.assertEqual(again.string(fn.return_type), "None")
        self.assertEqual(fn.instructions, [])
        self.assertIn("SetTestThing", [again.string(d.function) for d in again.debug])
        # existing string indices never move; only the new names are appended
        self.assertEqual(again.strings[:before], pex.parse(self.data).strings)
        self.assertEqual(len(again.strings), before + 2)  # "SetTestThing", "amount"

    def test_a_second_declaration_and_an_unknown_object_are_refused(self):
        p = pex.parse(self.data)
        with self.assertRaises(pex.PexError):
            pex.add_native(p, "TESModPlatform", "CloseMenu", "None", [])
        with self.assertRaises(pex.PexError):
            pex.add_native(p, "NoSuchScript", "X", "None", [])

    def test_truncated_and_trailing_input_is_refused(self):
        with self.assertRaises(pex.PexError):
            pex.parse(self.data[:-1])
        with self.assertRaises(pex.PexError):
            pex.parse(self.data + b"\0")
        with self.assertRaises(pex.PexError):
            pex.parse(b"\0" * 16)


if __name__ == "__main__":
    unittest.main()
