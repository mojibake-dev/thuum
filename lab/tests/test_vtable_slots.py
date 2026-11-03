"""lab/tools/vtable-slots.py: which of a class's slot comments sit in its primary vtable. A fixture header
covers the section rules (the primary chain's overrides and `// add` kept, a secondary base's overrides and pure
virtuals skipped), an AE-only conditional, a two-line declaration and SKYRIM_REL_VR_VIRTUAL's SE/AE slot; the
submodule test pins TESForm::AddChange at slot 0x0A (RE/T/TESForm.h:133)."""
import importlib.util
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("vtable_slots", ROOT / "lab" / "tools" / "vtable-slots.py")
vs = importlib.util.module_from_spec(_spec)
sys.modules["vtable_slots"] = vs  # dataclasses look their module up while the class is built
_spec.loader.exec_module(vs)

CLIB = ROOT / "CommonLibSSE-NG"
HAVE_CLIB = (CLIB / "include" / "RE" / "T" / "TESForm.h").exists()

HEADER = """#pragma once

namespace RE
{
	class Root
	{
	public:
		inline static constexpr auto RTTI = RTTI_Root;

		virtual ~Root();  // 00

		// add
		virtual void Pure() = 0;                 // 01
		virtual bool Kept(std::uint32_t a_flag,
			bool a_more);                        // 02 - { return false; }
	};

	class Side
	{
	public:
		virtual ~Side();  // 00

		// add
		virtual void SideOnly();  // 01
	};

	class Derived :
		public Root,  // 00
		public Side   // 08
	{
	public:
		inline static constexpr auto VTABLE = VTABLE_Derived;

		~Derived() override;  // 00

		// override (Root)
		void Pure() override;  // 01

		// override (Side)
		void SideOnly() override;  // 01

		// add
#if !defined(ENABLE_SKYRIM_AE) && !defined(ENABLE_SKYRIM_SE)
		virtual void VROnly();  // 03
#endif
		virtual void Added();                  // 03
		SKYRIM_REL_VR_VIRTUAL void Shifted();  // 04, 05

		// members
		std::uint32_t data;  // 10
	};
}
"""


def parse(text: str) -> dict[str, "vs.ClassDecl"]:
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "include" / "RE" / "X").mkdir(parents=True)
        path = root / "include" / "RE" / "X" / "Fixture.h"
        path.write_text(text)
        return {c.name: c for c in vs.parse_file(path, root, Counter())}


def primary(classes: dict, name: str) -> tuple[list[tuple[int, str]], list[str]]:
    index = {c.path: c for c in classes.values()}
    chain, names = vs.chain_of(classes[name], index)
    kept, skipped = vs.primary_slots(classes[name], chain, names)
    return sorted((s.slot, s.method) for s in kept), sorted(reason for reason, _ in skipped)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.classes = parse(HEADER)

    def test_heads_constants_and_bases(self):
        self.assertEqual(sorted(self.classes), ["Derived", "Root", "Side"])
        self.assertEqual(self.classes["Derived"].bases, ["Root", "Side"])
        self.assertEqual(self.classes["Derived"].vtable, "VTABLE_Derived")
        self.assertEqual(self.classes["Root"].rtti, "Root")

    def test_pure_virtual_is_skipped_and_a_two_line_declaration_kept(self):
        kept, skipped = primary(self.classes, "Root")
        self.assertEqual(kept, [(0x00, "~Root"), (0x02, "Kept")])
        self.assertEqual(skipped, ["pure virtual (the slot holds _purecall)"])

    def test_primary_chain_kept_secondary_base_skipped_ae_branch_read(self):
        kept, skipped = primary(self.classes, "Derived")
        self.assertEqual(kept, [(0x00, "~Derived"), (0x01, "Pure"), (0x03, "Added"), (0x04, "Shifted")])
        self.assertEqual(skipped, ["secondary base's vtable"])

    def test_conditions_read_as_an_ae_only_build(self):
        n = Counter()
        self.assertTrue(vs.eval_cond("ifndef", "SKYRIM_CROSS_VR", n))
        self.assertFalse(vs.eval_cond("ifndef", "ENABLE_SKYRIM_AE", n))
        self.assertFalse(vs.eval_cond("if", "!defined(ENABLE_SKYRIM_AE) && !defined(ENABLE_SKYRIM_SE)", n))
        self.assertTrue(vs.eval_cond("if", "!defined(ENABLE_SKYRIM_SE) && !defined(ENABLE_SKYRIM_VR)", n))
        self.assertFalse(vs.eval_cond("if", "SOME_VERSION >= 3", n))
        self.assertEqual(n, Counter({"SOME_VERSION >= 3": 1}))


@unittest.skipUnless(HAVE_CLIB, "CommonLibSSE-NG submodule not checked out")
class Submodule(unittest.TestCase):
    def test_tesform_addchange_is_primary_slot_0a(self):
        unknown = Counter()
        classes = vs.parse_file(CLIB / "include" / "RE" / "T" / "TESForm.h", CLIB, unknown)
        classes += vs.parse_file(CLIB / "include" / "RE" / "B" / "BaseFormComponent.h", CLIB, unknown)
        by = {c.name: c for c in classes}
        kept, _ = primary(by, "TESForm")
        self.assertIn((0x0A, "AddChange"), kept)
        self.assertIn((0x00, "~TESForm"), kept)


if __name__ == "__main__":
    unittest.main()
