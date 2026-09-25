"""Tests for lab/ledger.py: a synthetic fork with every status, hand-column
preservation, and, when the skymp submodule is present, facts the fork
exploration established (Debug.Notification delegates, Game.IncrementStat is
a stub, Actor.IsDead is overridden by the gamemode)."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab"))

import ledger  # noqa: E402

SKYMP = ROOT / "skymp"

DUMP = {
    "types": {
        "Game": {"parent": "Form", "globalFunctions": [
            {"name": "GetPlayer", "isLatent": False, "arguments": [], "returnType": {"rawType": "Object"}},
            {"name": "IncrementStat", "isLatent": False, "arguments": [], "returnType": {"rawType": "None"}},
            {"name": "Missing", "isLatent": True, "arguments": [], "returnType": {"rawType": "None"}},
        ], "memberFunctions": []},
        "Debug": {"parent": "Form", "globalFunctions": [
            {"name": "Notification", "isLatent": False, "arguments": [], "returnType": {"rawType": "None"}},
        ], "memberFunctions": []},
        "Actor": {"parent": "ObjectReference", "globalFunctions": [], "memberFunctions": [
            {"name": "IsDead", "isLatent": False, "arguments": [], "returnType": {"rawType": "Bool"}},
        ]},
    }
}

GAME_H = '''class PapyrusGame final : public IPapyrusClass<PapyrusGame>
{
public:
  const char* GetName() override { return "Game"; }
};
'''
GAME_CPP = '''#include "PapyrusGame.h"

VarValue PapyrusGame::GetPlayer(VarValue self, const std::vector<VarValue>& arguments)
{
  // real work
  auto x = compute(arguments);
  return VarValue(x);
}

VarValue PapyrusGame::IncrementStat(VarValue self,
                                    const std::vector<VarValue>& arguments)
{
  return VarValue::None();
}

VarValue PapyrusGame::Extra(VarValue self, const std::vector<VarValue>& arguments)
{
  return VarValue(1);
}

void PapyrusGame::Register(VirtualMachine& vm, std::shared_ptr<IPapyrusCompatibilityPolicy> policy)
{
  AddStatic(vm, "GetPlayer", &PapyrusGame::GetPlayer);
  AddStatic(vm, "IncrementStat",
            &PapyrusGame::IncrementStat);
  AddStatic(vm, "Extra", &PapyrusGame::Extra);
}
'''
DEBUG_H = '''class PapyrusDebug final : public IPapyrusClass<PapyrusDebug>
{
public:
  const char* GetName() override { return "Debug"; }
};
'''
DEBUG_CPP = '''VarValue PapyrusDebug::Notification(VarValue self, const std::vector<VarValue>& arguments)
{
  return ExecuteSpSnippetAndGetPromise(GetName(), "Notification", compatibilityPolicy, self, arguments);
}
void PapyrusDebug::Register(VirtualMachine& vm, std::shared_ptr<IPapyrusCompatibilityPolicy> policy)
{
  AddStatic(vm, "Notification", &PapyrusDebug::Notification);
}
'''
ACTOR_H = '''class PapyrusActor final : public IPapyrusClass<PapyrusActor>
{
public:
  const char* GetName() override { return "Actor"; }
};
'''
ACTOR_CPP = '''VarValue PapyrusActor::IsDead(VarValue self, const std::vector<VarValue>& arguments)
{
  return VarValue(GetFormPtr<MpActor>(self)->IsDead());
}
void PapyrusActor::Register(VirtualMachine& vm, std::shared_ptr<IPapyrusCompatibilityPolicy> policy)
{
  AddMethod(vm, "IsDead", &PapyrusActor::IsDead);
}
'''
INDEX_TS = '''mp.registerPapyrusFunction('method', 'Actor', 'IsDead', (self, args) => isDead(mp, self, args));
mp.registerPapyrusFunction('global', 'SweetPie', 'SPLog', (self, args) => placeholder(mp, self, args, 'SPLog'));
'''


def make_fork(root: Path) -> None:
    (root / ledger.DUMP).parent.mkdir(parents=True)
    (root / ledger.DUMP).write_text(json.dumps(DUMP))
    c = root / ledger.CLASSES
    c.mkdir(parents=True)
    (c / "PapyrusGame.h").write_text(GAME_H)
    (c / "PapyrusGame.cpp").write_text(GAME_CPP)
    (c / "PapyrusDebug.h").write_text(DEBUG_H)
    (c / "PapyrusDebug.cpp").write_text(DEBUG_CPP)
    (c / "PapyrusActor.h").write_text(ACTOR_H)
    (c / "PapyrusActor.cpp").write_text(ACTOR_CPP)
    (root / ledger.FUNCTIONS_LIB).parent.mkdir(parents=True)
    (root / ledger.FUNCTIONS_LIB).write_text(INDEX_TS)


class Synthetic(unittest.TestCase):
    def test_every_status_and_the_not_in_dump_case(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            make_fork(root)
            natives = {n.key: n for n in ledger.build(root)}
        self.assertEqual(natives["Game.GetPlayer"].status, "implemented")
        self.assertEqual(natives["Game.IncrementStat"].status, "stub")
        self.assertEqual(natives["Game.Missing"].status, "missing")
        self.assertTrue(natives["Game.Missing"].latent)
        self.assertEqual(natives["Debug.Notification"].status, "delegated")
        self.assertEqual(natives["Actor.IsDead"].status, "gamemode")
        self.assertIn("overrides the C++ implemented", natives["Actor.IsDead"].note)
        self.assertEqual(natives["SweetPie.SPLog"].status, "gamemode")
        self.assertFalse(natives["SweetPie.SPLog"].in_dump)
        self.assertEqual(natives["Game.Extra"].status, "implemented")
        self.assertFalse(natives["Game.Extra"].in_dump)
        # the source column points at the registration line, not the definition
        self.assertTrue(natives["Game.IncrementStat"].source.endswith(":24"), natives["Game.IncrementStat"].source)

    def test_hand_columns_survive_regeneration(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            make_fork(root)
            md = root / "NATIVES.md"
            self.assertEqual(ledger.main([str(root), str(md)]), 0)
            text = md.read_text()
            self.assertIn("| `Game.IncrementStat` (global) | stub |  |", text)
            # A human fills the hand columns.
            text = text.replace("| `Game.IncrementStat` (global) | stub |  | [returns None; skymp5-server/cpp/server_guest_lib/script_classes/PapyrusGame.cpp:24] |  |",
                                "| `Game.IncrementStat` (global) | stub | R0 | never: stats are client cosmetics | docs/verbs/none.md |")
            self.assertIn("never: stats are client cosmetics", text)
            md.write_text(text)
            self.assertEqual(ledger.main([str(root), str(md)]), 0)
            again = md.read_text()
            self.assertIn("| `Game.IncrementStat` (global) | stub | R0 | never: stats are client cosmetics [returns None; skymp5-server/cpp/server_guest_lib/script_classes/PapyrusGame.cpp:24] | docs/verbs/none.md |", again)
            self.assertIn("| stub | 1 |", again)
            self.assertEqual(ledger.main([str(root), str(md)]), 0)
            self.assertEqual(md.read_text(), again, "regeneration must be idempotent")
            self.assertNotIn(chr(0x2014), again)


@unittest.skipUnless((SKYMP / ledger.DUMP).is_file(), "skymp submodule not checked out")
class RealFork(unittest.TestCase):
    def test_established_facts(self):
        natives = {n.key: n for n in ledger.build(SKYMP)}
        self.assertGreater(len(natives), 1400)
        self.assertEqual(natives["Debug.Notification"].status, "delegated")
        self.assertEqual(natives["Debug.MessageBox"].status, "delegated")
        self.assertEqual(natives["Game.IncrementStat"].status, "stub")
        self.assertEqual(natives["Game.GetPlayer"].status, "implemented")
        self.assertEqual(natives["Actor.IsDead"].status, "gamemode")
        self.assertEqual(natives["ObjectReference.MoveTo"].status, "gamemode")
        self.assertEqual(natives["SweetPie.SPLog"].status, "gamemode")
        self.assertFalse(natives["SweetPie.SPLog"].in_dump)
        # every Papyrus class the factory registers resolved to its Papyrus name
        classes = {n.cls for n in natives.values() if n.status in ("implemented", "delegated", "stub")}
        for expected in ("Game", "ObjectReference", "Actor", "Debug", "Utility", "Skymp", "EffectShader", "LeveledItem"):
            self.assertIn(expected, classes, expected)


if __name__ == "__main__":
    unittest.main()
