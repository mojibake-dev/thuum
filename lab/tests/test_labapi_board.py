import asyncio
import unittest

from _labapi import needs_deps


@needs_deps
class BoardTests(unittest.TestCase):
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
