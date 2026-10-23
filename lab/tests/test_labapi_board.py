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
            # racemenu-save answers are kept by the name saved
            save = board.enqueue("c1", "racemenu-save", {"name": "own-before"})
            board.poll("c1")
            board.complete(save.id, {"ok": True, "data": {"saved": "own-before", "bytes": 2932, "sha256": "54d2"}})
            self.assertEqual(board.presets("c1")["own-before"]["bytes"], 2932)
            board.clear_views()
            self.assertIsNone(board.held("c1"))
            self.assertIsNone(board.projectiles("c2"))
            self.assertIsNone(board.refs_near("c2"))
            self.assertIsNone(board.figure_spells("c1"))
            self.assertIsNone(board.log_count("c2", "moved .* into"))
            self.assertIsNone(board.node_scales("c1"))
            self.assertIsNone(board.presets("c1"))
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
