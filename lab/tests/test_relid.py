"""lab/relid.py: the CommonLibSSE-NG Address Library ID index."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))

import relid  # noqa: E402

CLIB = ROOT / "CommonLibSSE-NG"
HAVE_CLIB = (CLIB / "include" / "REL" / "ID.h").exists()

_TABLE = None


def table():
    global _TABLE
    if _TABLE is None:
        _TABLE = relid.index_tree(CLIB)
    return _TABLE


def by_id(rows, se, ae):
    return [e for e in rows if e.se == se and e.ae == ae]


@unittest.skipUnless(HAVE_CLIB, "CommonLibSSE-NG submodule not checked out")
class SubmoduleIndex(unittest.TestCase):
    def test_function_relocation_is_named_from_decltype(self):
        e = by_id(table(), 37787, 38736)
        self.assertEqual([x.name for x in e], ["RE::Actor::AddCastPower"])
        self.assertEqual((e[0].kind, e[0].file), ("function", "src/RE/A/Actor.cpp"))

    def test_data_relocation_is_named_after_variable_and_scope(self):
        self.assertEqual({x.name for x in by_id(table(), 514351, 400507)}, {"RE::TESForm::GetAllForms::allForms"})

    def test_offset_constants_carry_their_namespace(self):
        e = by_id(table(), 11471, 11617)
        self.assertEqual([(x.kind, x.name) for x in e], [("offset", "RE::Offset::ExtraDataList::SetCount")])

    def test_vtable_slots_and_rtti(self):
        vt = [x for x in table() if x.name == "VTABLE_IFormFactory"]
        self.assertEqual([(x.se, x.ae, x.vr, x.slot) for x in vt], [(228345, 186197, 0x1596628, 0)])
        rt = [x for x in table() if x.name == "RTTI_IFormFactory"]
        self.assertEqual([(x.se, x.ae, x.vr) for x in rt], [(684588, 392214, 0x1ed6cf8)])
        self.assertTrue(any(x.kind == "nirtti" for x in table()))

    def test_coverage_of_the_pinned_submodule(self):
        kinds = {}
        for e in table():
            kinds[e.kind] = kinds.get(e.kind, 0) + 1
        self.assertGreaterEqual(kinds["function"], 400)
        self.assertGreaterEqual(kinds["vtable"], 8000)
        self.assertGreaterEqual(kinds["rtti"], 7000)
        unnamed = [f"{e.file}:{e.line}" for e in table() if e.name.endswith("?")]
        self.assertLessEqual(len(unnamed), 8, unnamed)


class Scanner(unittest.TestCase):
    def test_scope_scanner_on_a_small_header(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "include" / "REL").mkdir(parents=True)
            (root / "include" / "REL" / "ID.h").write_text("")
            (root / "src").mkdir()
            (root / "include" / "Foo.h").write_text(
                "namespace RE::Deep\n{\n\tclass Foo\n\t{\n\tpublic:\n"
                "\t\tvoid Bar()\n\t\t{\n\t\t\tusing func_t = decltype(&Foo::Bar);\n"
                "\t\t\tREL::Relocation<func_t> func{ RELOCATION_ID(1, 2) };\n\t\t}\n"
                "\t\tstatic int* Ptr()\n\t\t{\n\t\t\tREL::Relocation<int*> value{ RELOCATION_ID(3, 4) };\n\t\t\treturn value.get();\n\t\t}\n"
                "\t};\n}\n"
            )
            rows = relid.index_tree(root)
        self.assertEqual(
            [(e.kind, e.name, e.se, e.ae) for e in rows],
            [("function", "RE::Deep::Foo::Bar", 1, 2), ("data", "RE::Deep::Foo::Ptr::value", 3, 4)],
        )

    def test_row_format_is_stable(self):
        e = relid.Entry(1, 2, None, "function", "RE::X::Y", 0, "include/RE/X/X.h", 7)
        self.assertEqual(e.row(), "1\t2\t\tfunction\tRE::X::Y\t0\tinclude/RE/X/X.h\t7")


if __name__ == "__main__":
    unittest.main()
