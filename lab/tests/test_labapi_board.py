import asyncio
import unittest

from _labapi import needs_deps


@needs_deps
class BoardTests(unittest.TestCase):
    def test_npc_state_answers_are_kept_by_the_form_id_they_named(self):
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)
        named = board.enqueue("c2", "npc-state", {"formId": 0x13483})
        board.poll("c2")
        board.complete(named.id, {"ok": True, "data": {"formId": 0x13483, "aiEnabled": False}})
        placed = board.enqueue("c2", "npc-state", {})
        board.poll("c2")
        board.complete(placed.id, {"ok": True, "data": {"formId": 0xFF000ABC, "aiEnabled": True}})
        missing = board.enqueue("c2", "npc-state", {"formId": 0x13484})
        board.poll("c2")
        board.complete(missing.id, {"ok": True, "data": {"error": "no placed npc and no {formId}"}})
        self.assertFalse(board.npc_state("c2", 0x13483)["aiEnabled"])
        self.assertTrue(board.npc_state("c2", 0xFF000ABC)["aiEnabled"])
        self.assertIsNone(board.npc_state("c2", 0x13484), "an error answer is no state")
        self.assertIsNone(board.npc_state("c1", 0x13483))
        board.clear_views()
        self.assertIsNone(board.npc_state("c2", 0x13483))

    def test_script_state_answers_are_kept_by_the_form_id_they_named(self):
        # ADR-068 rung 3's read (c.script_state(id)): a busy answer names no formId of its own and is kept by the step's;
        # a later read of the same reference replaces it; the native's refusal is an error answer, kept in its place
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)
        busy = board.enqueue("c1", "script-state", {"formId": 0xAA8CB})
        board.poll("c1")
        board.complete(busy.id, {"ok": True, "data": {"quiescent": False, "busy": "stack 4711 state 3 in defaultPuzzlePillarScript.RotatePillarToState"}})
        self.assertFalse(board.script_state("c1", 0xAA8CB)["quiescent"])
        rest = board.enqueue("c1", "script-state", {"formId": 0xAA8CB})
        board.poll("c1")
        board.complete(rest.id, {"ok": True, "data": {"formId": 0xAA8CB, "quiescent": True, "fnv1a": 7, "scripts": []}})
        lever = board.enqueue("c1", "script-state", {"formId": 0xAA8C3})
        board.poll("c1")
        board.complete(lever.id, {"ok": True, "data": {"formId": 0xAA8C3, "quiescent": True, "fnv1a": 9, "scripts": []}})
        refused = board.enqueue("c1", "script-state", {"formId": 0x380B3})
        board.poll("c1")
        board.complete(refused.id, {"ok": True, "data": {"error": "SerializeScriptState refused 380b3 (answer \"\"; the seat's log says why)"}})
        self.assertTrue(board.script_state("c1", 0xAA8CB)["quiescent"])
        self.assertEqual(board.script_state("c1", 0xAA8C3)["fnv1a"], 9)
        self.assertIn("refused 380b3", board.script_state("c1", 0x380B3)["error"])
        self.assertIsNone(board.script_state("c2", 0xAA8CB))
        board.clear_views()
        self.assertIsNone(board.script_state("c1", 0xAA8CB))

    def test_a_failed_script_state_read_takes_the_place_of_the_last_good_one(self):
        # the fresh review of b-script-state-restart, note 1: a relaunched seat whose read fails must not be read as its
        # earlier game's answer, so an error answer and a step that failed outright both replace it
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)
        good = board.enqueue("c1", "script-state", {"formId": 0xAA8CB})
        board.poll("c1")
        board.complete(good.id, {"ok": True, "data": {"formId": 0xAA8CB, "quiescent": True, "fnv1a": 7, "scripts": []}})
        gone = board.enqueue("c1", "script-state", {"formId": 0xAA8CB})
        board.poll("c1")
        board.complete(gone.id, {"ok": True, "data": {"error": "no reference aa8cb in this game"}})
        self.assertEqual(board.script_state("c1", 0xAA8CB), {"error": "no reference aa8cb in this game"})
        again = board.enqueue("c1", "script-state", {"formId": 0xAA8CB})
        board.poll("c1")
        board.complete(again.id, {"ok": True, "data": {"formId": 0xAA8CB, "quiescent": True, "fnv1a": 8, "scripts": []}})
        self.assertEqual(board.script_state("c1", 0xAA8CB)["fnv1a"], 8)
        thrown = board.enqueue("c1", "script-state", {"formId": 0xAA8CB})
        board.poll("c1")
        board.complete(thrown.id, {"ok": False, "error": "TypeError: x is undefined"})
        self.assertEqual(board.script_state("c1", 0xAA8CB), {"error": "TypeError: x is undefined"})

    def test_inventory_answers_are_kept_by_the_ref_they_named(self):
        # two chests read in one run stay apart (c.inventory(ref), the root-cause plan's W4)
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)
        for ref, items in ((0x371E9, {str(0x12EB7): 1}), (0x3975B, {str(0xF): 25})):
            step = board.enqueue("c2", "inventory", {"ref": ref})
            board.poll("c2")
            board.complete(step.id, {"ok": True, "data": {"ref": ref, "items": items}})
        missing = board.enqueue("c2", "inventory", {"ref": 0x99999})
        board.poll("c2")
        board.complete(missing.id, {"ok": True, "data": {"error": "no such ref"}})
        self.assertEqual(board.inventory("c2", 0x371E9)["items"], {str(0x12EB7): 1})
        self.assertEqual(board.inventory("c2", 0x3975B)["items"], {str(0xF): 25})
        self.assertIsNone(board.inventory("c2", 0x99999), "an error answer is no view")
        self.assertIsNone(board.inventory("c1", 0x371E9))
        board.clear_views()
        self.assertIsNone(board.inventory("c2", 0x371E9))

    def test_quest_stage_answers_merge_by_quest(self):
        # x-quest-stage (ADR-056): a second read of one quest replaces the first; a quest the read did not name stays
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)
        first = board.enqueue("c2", "quest-stage", {"quests": [0x74A83, 0x39645]})
        board.poll("c2")
        board.complete(first.id, {"ok": True, "data": {str(0x74A83): {"stage": 0, "running": True, "done": {}},
                                                        str(0x39645): None}})
        again = board.enqueue("c2", "quest-stage", {"quests": [0x74A83], "stages": [10]})
        board.poll("c2")
        board.complete(again.id, {"ok": True, "data": {str(0x74A83): {"stage": 10, "running": True, "done": {"10": True}}}})
        quests = board.quests("c2")
        self.assertEqual(quests[0x74A83]["stage"], 10)
        self.assertIn(0x39645, quests)
        self.assertIsNone(quests[0x39645], "a form that is no quest in that game is kept as None")
        self.assertIsNone(board.quests("c1"))
        board.clear_views()
        self.assertIsNone(board.quests("c2"))

    def test_alias_and_factions_answers_are_kept_by_what_they_named(self):
        # ADR-068 rung 4's reads: an alias answer by its (quest, alias) pair, alias 0 included; a factions answer by its
        # actor; an error answer and a failed step take the key's place, as script-state's do (the alias ids and names are
        # the fixture's own, not MS13's)
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)

        def answer(client, action, args, body):
            step = board.enqueue(client, action, args)
            board.poll(client)
            board.complete(step.id, body)

        answer("c1", "alias", {"quest": 0x39645, "alias": 0}, {"ok": True, "data": {"quest": 0x39645, "alias": 0, "refr": 0x39655, "name": "Arvel"}})
        answer("c1", "alias", {"quest": 0x39645, "alias": 11}, {"ok": True, "data": {"quest": 0x39645, "alias": 11, "refr": 0, "name": "Empty"}})
        self.assertEqual(board.alias("c1", 0x39645, 0)["refr"], 0x39655)
        self.assertEqual(board.alias("c1", 0x39645, 11)["refr"], 0)
        answer("c1", "alias", {"quest": 0x39645, "alias": 0}, {"ok": True, "data": {"error": "quest 39645 has no alias 0"}})
        self.assertEqual(board.alias("c1", 0x39645, 0), {"error": "quest 39645 has no alias 0"})
        answer("c1", "alias", {"quest": 0x39645, "alias": 11}, {"ok": False, "error": "TypeError: x is undefined"})
        self.assertEqual(board.alias("c1", 0x39645, 11), {"error": "TypeError: x is undefined"})
        self.assertIsNone(board.alias("c2", 0x39645, 0))

        answer("c2", "factions", {"formId": 0x39655, "factions": [0x5C84E]},
               {"ok": True, "data": {"formId": 0x39655, "ranks": {str(0x5C84E): -1}, "members": {str(0x5C84E): False}, "crime": 0}})
        self.assertEqual(board.factions("c2", 0x39655)["ranks"], {str(0x5C84E): -1})
        answer("c2", "factions", {"formId": 0x39655, "factions": [0x5C84E]}, {"ok": True, "data": {"error": "no actor 39655 in this game"}})
        self.assertIn("no actor", board.factions("c2", 0x39655)["error"])
        self.assertIsNone(board.factions("c1", 0x39655))
        board.clear_views()
        self.assertIsNone(board.alias("c1", 0x39645, 0))
        self.assertIsNone(board.factions("c2", 0x39655))

    def test_script_vars_and_objectives_answers_are_kept_by_what_they_named(self):
        # ADR-068 rung 5's reads: a script-vars answer by its form, a quest-objectives answer by its quest; an error answer
        # and a failed step take the key's place, as script-state's do
        from labapi.board import StepBoard

        board = StepBoard(clock=lambda: 100.0)

        def answer(client, action, args, body):
            step = board.enqueue(client, action, args)
            board.poll(client)
            board.complete(step.id, body)

        keys = ["PlayerVampireQuestScript::::VampireStatus_var"]
        row = {"form": 0xEAFD5, "script": "PlayerVampireQuestScript", "var": "::VampireStatus_var", "k": 3, "i": 1}
        answer("c1", "script-vars", {"form": 0xEAFD5, "keys": keys}, {"ok": True, "data": {"form": 0xEAFD5, "vars": [row]}})
        self.assertEqual(board.script_vars("c1", 0xEAFD5)["vars"], [row])
        answer("c1", "script-vars", {"form": 0xEAFD5, "keys": keys}, {"ok": True, "data": {"error": "ReadScriptVariables refused eafd5"}})
        self.assertIn("refused", board.script_vars("c1", 0xEAFD5)["error"])
        answer("c1", "script-vars", {"form": 0xEAFD5, "keys": keys}, {"ok": False, "error": "TypeError: x is undefined"})
        self.assertEqual(board.script_vars("c1", 0xEAFD5), {"error": "TypeError: x is undefined"})
        self.assertIsNone(board.script_vars("c2", 0xEAFD5))

        read = {"quest": 0x74A83, "running": True, "objectives": {"10": {"displayed": True, "completed": False}}}
        answer("c2", "quest-objectives", {"quest": 0x74A83, "objectives": [10]}, {"ok": True, "data": read})
        self.assertEqual(board.objectives("c2", 0x74A83), read)
        answer("c2", "quest-objectives", {"quest": 0x74A83, "objectives": [10]}, {"ok": True, "data": {"error": "no quest 74a83 in this game"}})
        self.assertIn("no quest", board.objectives("c2", 0x74A83)["error"])
        self.assertIsNone(board.objectives("c1", 0x74A83))
        board.clear_views()
        self.assertIsNone(board.script_vars("c1", 0xEAFD5))
        self.assertIsNone(board.objectives("c2", 0x74A83))

    def test_a_seats_kept_perks_go_again_after_a_heartbeat_gap(self):
        from labapi.board import PERK_GAP_S, StepBoard

        clock = [100.0]
        board = StepBoard(clock=lambda: clock[0])
        self.assertEqual(board.poll("c1"), {})
        board.keep_perks("c1", [0x7934B])
        self.assertEqual(board.seat_perks(), {"c1": [0x7934B]})
        clock[0] += 1
        self.assertEqual(board.poll("c1"), {}, "a game polling all along has them from the route's own step")
        clock[0] += PERK_GAP_S + 1  # the game was gone: a relaunch
        got = board.poll("c1")
        self.assertEqual((got["action"], got["args"]), ("add-perks", {"ids": [0x7934B], "keep": True}))
        board.complete(got["id"], {"ok": True, "data": {"added": [0x7934B]}})
        clock[0] += 1
        self.assertEqual(board.poll("c1"), {})
        clock[0] += PERK_GAP_S + 1
        self.assertEqual(board.poll("c2"), {}, "another seat keeps nothing")
        board.keep_perks("c1", [])
        self.assertEqual(board.poll("c1"), {}, "an empty list forgets them")
        board.keep_perks("c2", [1])
        board.forget_perks()
        self.assertEqual(board.seat_perks(), {})

    def test_queue_heartbeat_and_completion(self):
        from labapi.board import StepBoard

        async def go():
            clock = [100.0]
            board = StepBoard(clock=lambda: clock[0])
            self.assertEqual(board.poll("c1"), {})
            self.assertEqual(board.heartbeats(), {"c1": 0.0})
            step = board.enqueue("c1", "move", {"dx": 1})
            got = board.poll("c1")
            self.assertEqual(got, {"id": step.id, "action": "move", "args": {"dx": 1}})
            self.assertEqual(board.poll("c1"), {}, "in flight, nothing more queued")
            self.assertFalse(board.complete("nope", {"ok": True}))
            waiter = asyncio.create_task(board.wait(step, 5))
            await asyncio.sleep(0)
            self.assertTrue(board.complete(step.id, {"ok": True, "data": {"n": 1}}))
            self.assertTrue(await waiter)
            self.assertTrue(step.ok)
            self.assertEqual(step.result["data"], {"n": 1})
            # dump-state results become the client's view
            dump = board.enqueue("c1", "dump-state")
            board.poll("c1")
            board.complete(dump.id, {"ok": True, "data": {"sees": {"c2": {"x": 1, "y": 2, "z": 3}}}})
            self.assertEqual(board.view("c1")["sees"]["c2"]["x"], 1)
            # watch-stop results become the client's watch, apart from its view
            stop = board.enqueue("c1", "watch-stop")
            board.poll("c1")
            board.complete(stop.id, {"ok": True, "data": {"actors": [{"formId": 1, "maxDisplacement": 2.0}]}})
            self.assertEqual(board.watch("c1")["actors"][0]["maxDisplacement"], 2.0)
            self.assertIn("sees", board.view("c1"))
            # held results are kept per client and cleared with the views
            held = board.enqueue("c1", "held", {"ids": [524516]})
            board.poll("c1")
            board.complete(held.id, {"ok": True, "data": {"524516": 0}})
            self.assertEqual(board.held("c1")["524516"], 0)
            self.assertIsNone(board.held("c2"))
            # projectiles results too
            arrows = board.enqueue("c2", "projectiles", {"ids": [245265], "radius": 3000})
            board.poll("c2")
            board.complete(arrows.id, {"ok": True, "data": {"from": 20, "refs": {"245265": None}}})
            self.assertIsNone(board.projectiles("c2")["refs"]["245265"])
            self.assertIsNone(board.projectiles("c1"))
            # refs-near results too, the last per observer
            near = board.enqueue("c2", "refs-near", {"radius": 1200, "formTypes": [50, 24], "ids": [392127]})
            board.poll("c2")
            board.complete(near.id, {"ok": True, "data": {"from": 20, "types": {"50": {"inCell": 1}, "24": {"inCell": 3, "near": 0, "refs": []}}, "ids": {"392127": None}}})
            self.assertEqual(board.refs_near("c2")["types"]["50"]["inCell"], 1)
            self.assertIsNone(board.refs_near("c1"))
            # figure-spells answers too, the last per observer, a driver error kept out
            spells = board.enqueue("c1", "figure-spells", {})
            board.poll("c1")
            board.complete(spells.id, {"ok": True, "data": {"formId": 4278192173, "base": 7, "added": [77776], "equipped": [0, 77776, 0], "extra": []}})
            self.assertEqual(board.figure_spells("c1")["added"], [77776])
            self.assertIsNone(board.figure_spells("c2"))
            # log counts by their pattern, set by lab-api's own log-count step
            board.set_log_count("c2", "moved .* into", 2)
            self.assertEqual(board.log_count("c2", "moved .* into"), 2)
            self.assertIsNone(board.log_count("c2", "stale"))
            # a client's own node-scale and its {other: true} one are kept side by side
            own = board.enqueue("c1", "node-scale", {})
            board.poll("c1")
            board.complete(own.id, {"ok": True, "data": {"engine": 1.6}})
            seen = board.enqueue("c1", "node-scale", {"other": True})
            board.poll("c1")
            board.complete(seen.id, {"ok": True, "data": {"engine": 1.0, "all": []}})
            self.assertEqual(board.node_scales("c1")["self"]["engine"], 1.6)
            self.assertEqual(board.node_scales("c1")["other"]["engine"], 1.0)
            # node-rotation answers are kept by the form id read and the step's label; an error answer is no read
            rot = board.enqueue("c2", "node-rotation", {"formId": 0xAA8CB, "nodes": ["Pillar01"], "label": "before"})
            board.poll("c2")
            board.complete(rot.id, {"ok": True, "data": {"formId": 0xAA8CB, "deferred": {"available": True, "read": False}}})
            bad = board.enqueue("c2", "node-rotation", {"formId": 0xAA8CB, "nodes": ["Pillar01"]})
            board.poll("c2")
            board.complete(bad.id, {"ok": True, "data": {"error": "no placed npc and no {formId}"}})
            self.assertEqual(list(board.node_rotations("c2")), [(0xAA8CB, "before")])
            # racemenu-save answers are kept by the name saved
            save = board.enqueue("c1", "racemenu-save", {"name": "own-before"})
            board.poll("c1")
            board.complete(save.id, {"ok": True, "data": {"saved": "own-before", "bytes": 2932, "sha256": "54d2"}})
            self.assertEqual(board.presets("c1")["own-before"]["bytes"], 2932)
            # a head-parts step on the client's own player is kept; a {other: true} one (a SkyMP figure's read lists the seat's
            # own base) is not (thuum D-E1, thuum-fa's delta review of 9f7f6426)
            mine = board.enqueue("c2", "head-parts", {})
            board.poll("c2")
            board.complete(mine.id, {"ok": True, "data": {"actor": 0x14, "parts": [{"id": 0x5162F, "type": 1, "name": "x"}]}})
            theirs = board.enqueue("c2", "head-parts", {"other": True})
            board.poll("c2")
            board.complete(theirs.id, {"ok": True, "data": {"actor": 0xFF000001, "parts": [{"id": 0x19D09, "type": 2, "name": "e"}]}})
            self.assertEqual(board.head_parts("c2")["actor"], 0x14)
            # a settings step's live values are kept per client
            st = board.enqueue("c1", "settings", {"ini": ["fMaxTime:HAVOK"]})
            board.poll("c1")
            board.complete(st.id, {"ok": True, "data": {"ini": {"fMaxTime:HAVOK": 0.016667}, "gmst": {}}})
            self.assertEqual(board.settings("c1")["ini"]["fMaxTime:HAVOK"], 0.016667)
            self.assertIsNone(board.settings("c2"))
            board.clear_views()
            self.assertIsNone(board.node_rotations("c2"))
            self.assertIsNone(board.held("c1"))
            self.assertIsNone(board.projectiles("c2"))
            self.assertIsNone(board.refs_near("c2"))
            self.assertIsNone(board.figure_spells("c1"))
            self.assertIsNone(board.log_count("c2", "moved .* into"))
            self.assertIsNone(board.node_scales("c1"))
            self.assertIsNone(board.presets("c1"))
            self.assertIsNone(board.head_parts("c2"))
            self.assertIsNone(board.settings("c1"))
            # a timed-out step is cancelled and a late result is ignored
            late = board.enqueue("c1", "connect")
            board.poll("c1")
            self.assertFalse(await board.wait(late, 0.05))
            self.assertFalse(board.complete(late.id, {"ok": True}))
            self.assertEqual(late.result["error"], "timeout")
            # heartbeat waiting sees a poll after `since`; on a real clock so the
            # negative case can time out
            import time

            real = StepBoard(clock=time.monotonic)
            since = time.monotonic()
            hb = asyncio.create_task(real.wait_heartbeat("c2", since, 2.0))
            await asyncio.sleep(0.1)
            real.poll("c2")
            self.assertTrue(await hb)
            self.assertFalse(await real.wait_heartbeat("c3", since, 0.2))

        asyncio.run(go())
