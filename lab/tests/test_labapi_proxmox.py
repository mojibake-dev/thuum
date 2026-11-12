import unittest

from _labapi import needs_deps


@needs_deps
class GuestControlTests(unittest.TestCase):
    def setUp(self):
        from labapi.fakes import FakeProxmox
        from labapi.guests import Guest
        from labapi.proxmox import GuestControl

        self.pve = FakeProxmox()
        self.control = GuestControl(self.pve)
        self.c1 = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-sp", "c1")
        self.re = Guest("sky-re", 701, "10.10.70.11", "lxc", "re", True, "clean")
        self.fen = Guest("fenestrate", 220, "10.10.60.20", "qemu", "client", False, "", "c2")

    def test_rollback_sequence_qemu_and_lxc(self):
        self.control.rollback_sequence(self.c1, self.c1.snapshot)
        self.control.rollback_sequence(self.re, self.re.snapshot)
        self.assertEqual(self.pve.calls, [
            ("stop", 711), ("rollback", 711, "clean-sp"), ("start", 711),
            ("stop", 701), ("rollback", 701, "clean"), ("start", 701),
        ])

    def test_unmanaged_guest_is_never_touched(self):
        from labapi.proxmox import ProxmoxError

        for call in (lambda: self.control.stop(self.fen), lambda: self.control.rollback(self.fen, "x"), lambda: self.control.start(self.fen),
                     lambda: self.control.exec(self.fen, ["cmd"], 1), lambda: self.control.file_read(self.fen, "C:\\x"), lambda: self.control.rollback_sequence(self.fen, "x")):
            with self.assertRaises(ProxmoxError):
                call()
        self.assertEqual(self.pve.calls, [])
        # not even a status query: fenestrate is outside pool sky and would 403
        self.assertEqual(self.control.status(self.fen), "unmanaged")
        self.assertEqual(self.pve.calls, [])

    def test_exec_is_qemu_only(self):
        from labapi.proxmox import ProxmoxError

        with self.assertRaises(ProxmoxError):
            self.control.exec(self.re, ["ls"], 1)

    def test_file_read_refuses_16_mib(self):
        from labapi.proxmox import FILE_READ_MAX, ProxmoxError

        self.pve.files["C:\\big"] = "x" * (FILE_READ_MAX + 1)
        self.pve.files["C:\\ok"] = "x" * 1024
        with self.assertRaises(ProxmoxError) as cm:
            self.control.file_read(self.c1, "C:\\big")
        self.assertIn("16 MiB", str(cm.exception))
        self.assertEqual(len(self.control.file_read(self.c1, "C:\\ok")), 1024)

    def test_backend_exceptions_become_proxmox_errors(self):
        """proxmoxer raises its own ResourceException (e.g. "QEMU guest agent is
        not running" after a rollback); the runner must only ever see ProxmoxError."""
        from labapi.fakes import FakeProxmox
        from labapi.guests import Guest
        from labapi.proxmox import GuestControl, ProxmoxError

        class Backend(FakeProxmox):
            def file_read(self, guest, path):
                raise RuntimeError("500 Internal Server Error: QEMU guest agent is not running")

            def start(self, guest):
                raise ValueError("boom")

        control = GuestControl(Backend())
        g = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-sp", "c1")
        with self.assertRaises(ProxmoxError) as cm:
            control.file_read(g, "C:\\sky-lab\\lab-driver.log")
        self.assertIn("E_PVE_FILE: sky-c1: RuntimeError: 500", str(cm.exception))
        with self.assertRaises(ProxmoxError) as cm:
            control.start(g)
        self.assertIn("E_PVE_START", str(cm.exception))

    def test_file_read_asks_again_after_an_agent_timeout(self):
        """A busy guest agent answers "got timeout" now and then (guest-file-close on 712, 2026-10-17):
        the read is asked again, up to three times in all; any other refusal is not."""
        from unittest import mock

        from labapi import proxmox
        from labapi.fakes import FakeProxmox
        from labapi.guests import Guest
        from labapi.proxmox import GuestControl, ProxmoxError

        timeout = "500 Internal Server Error: VM 712 qga command 'guest-file-close' failed - got timeout"

        class Backend(FakeProxmox):
            def __init__(self, answers):
                super().__init__()
                self.answers = list(answers)

            def file_read(self, guest, path):
                self.calls.append(("file_read", guest.vmid, path))
                a = self.answers.pop(0)
                if isinstance(a, Exception):
                    raise a
                return a

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "clean-sp", "c2")
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            b = Backend([RuntimeError(timeout), RuntimeError(timeout), "skse64 log"])
            self.assertEqual(GuestControl(b).file_read(g, "C:\\sky-lab\\c2-skse64.log"), "skse64 log")
            self.assertEqual(len(b.calls), 3)

            b = Backend([RuntimeError(timeout)] * 3)
            with self.assertRaises(ProxmoxError) as cm:
                GuestControl(b).file_read(g, "C:\\x")
            self.assertIn("got timeout", str(cm.exception))
            self.assertEqual(len(b.calls), 3)

            b = Backend([RuntimeError("500 Internal Server Error: VM 712 qga command 'guest-file-open' failed - No such file"), "never read"])
            with self.assertRaises(ProxmoxError):
                GuestControl(b).file_read(g, "C:\\x")
            self.assertEqual(len(b.calls), 1)

    def test_a_ranged_read_asks_again_after_an_agent_timeout_as_file_read_does(self):
        """20261111-191642-x-prop-blast: guest-file-read timed out on 711 and 712. A range's read is asked again, up to
        three times in all, as a whole file's is; any other refusal (a range that came back as no base64) is not."""
        from unittest import mock

        from labapi import proxmox
        from labapi.fakes import FakeProxmox
        from labapi.guests import Guest
        from labapi.proxmox import GuestControl, ProxmoxError

        timeout = "500 Internal Server Error: VM 711 qga command 'guest-file-read' failed - got timeout"

        class Backend(FakeProxmox):
            def __init__(self, answers):
                super().__init__()
                self.answers = list(answers)

            def file_read_range(self, guest, path, offset, count):
                self.calls.append(("file_read_range", guest.vmid, path, offset, count))
                a = self.answers.pop(0)
                if isinstance(a, Exception):
                    raise a
                return a

        g = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1")
        with mock.patch.object(proxmox, "FILE_READ_PAUSES", (0.0, 0.0)):
            b = Backend([RuntimeError(timeout), RuntimeError(timeout), b"\x00\xffrange"])
            self.assertEqual(GuestControl(b).file_read_range(g, "C:\\x.copy", 524288, 7), b"\x00\xffrange")
            self.assertEqual(b.calls, [("file_read_range", 711, "C:\\x.copy", 524288, 7)] * 3)

            b = Backend([RuntimeError(timeout)] * 3)
            with self.assertRaises(ProxmoxError) as cm:
                GuestControl(b).file_read_range(g, "C:\\x.copy", 0, 7)
            self.assertIn("got timeout", str(cm.exception))
            self.assertEqual(len(b.calls), 3)

            b = Backend([ProxmoxError("E_PVE_FILE: C:\\x.copy on sky-c1: the range at 0 came back as no base64"), b"never read"])
            with self.assertRaises(ProxmoxError):
                GuestControl(b).file_read_range(g, "C:\\x.copy", 0, 7)
            self.assertEqual(len(b.calls), 1)

    BUSY = "500 Internal Server Error: QEMU guest agent is not running"

    @staticmethod
    def _answering(answers):
        """A backend whose exec and whole file reads answer from `answers` in turn, an Exception raised and anything
        else returned, each call counted."""
        from labapi.fakes import FakeProxmox

        class Backend(FakeProxmox):
            def __init__(self):
                super().__init__()
                self.answers = list(answers)

            def _next(self, call):
                self.calls.append(call)
                a = self.answers.pop(0)
                if isinstance(a, Exception):
                    raise a
                return a

            def exec(self, guest, command, timeout):
                return self._next(("exec", guest.vmid))

            def file_read(self, guest, path):
                return self._next(("file_read", guest.vmid, path))

        return Backend()

    @staticmethod
    def _clock():
        """proxmox.py's time as a clock the test moves: sleep() records its pause and moves monotonic() by it."""
        import types

        clock = types.SimpleNamespace(t=0.0, slept=[])

        def sleep(s):
            clock.slept.append(s)
            clock.t += s

        clock.monotonic, clock.sleep = (lambda: clock.t), sleep
        return clock

    def test_a_busy_agent_is_asked_again_until_it_answers(self):
        """core's host journal, 2026-11-12: "QEMU guest agent is not running" is Proxmox's 3 s guest-ping unanswered by a
        busy qemu-ga (Agent.pm:83), daily on both seats and met by every agent call. A call so answered is asked again,
        1 s after and twice as long each time, and the ask the agent answers runs it: an exec and a file read alike, a
        read's own "got timeout" retry still its own (FILE_READ_PAUSES)."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import ExecResult, GuestControl

        timeout = "500 Internal Server Error: VM 711 qga command 'guest-file-read' failed - got timeout"
        clock = self._clock()
        b = self._answering([RuntimeError(self.BUSY), RuntimeError(self.BUSY), ExecResult(0, "ok", ""),
                             RuntimeError(timeout), RuntimeError(self.BUSY), "skse64 log"])
        control = GuestControl(b, agent_busy_s=30.0)
        with mock.patch.object(proxmox, "time", clock):
            self.assertEqual(control.exec(self.c1, ["cmd"], 5).out, "ok")
            self.assertEqual(control.file_read(self.c1, "C:\\sky-lab\\c1-skse64.log"), "skse64 log")
        self.assertEqual(b.calls, [("exec", 711)] * 3 + [("file_read", 711, "C:\\sky-lab\\c1-skse64.log")] * 3)
        self.assertEqual(clock.slept, [1.0, 2.0, proxmox.FILE_READ_PAUSES[0], 1.0])

    def test_a_busy_agent_past_its_window_fails_as_it_did_saying_how_long(self):
        """agent_busy_s (Settings, 30 s) bounds the asking from the first ask: pauses of 1, 2, 4 and 8 s and then what is
        left. The last answer is the call's own error, the runner's rule for a seat whose agent is not running still
        reading it (Runner._fetch_client_file), with how long it was asked."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import GuestControl, ProxmoxError

        clock = self._clock()
        b = self._answering([RuntimeError(self.BUSY)] * 6)
        with mock.patch.object(proxmox, "time", clock), self.assertRaises(ProxmoxError) as cm:
            GuestControl(b, agent_busy_s=30.0).exec(self.c1, ["cmd"], 5)
        self.assertEqual(str(cm.exception), f"E_PVE_EXEC: sky-c1: RuntimeError: {self.BUSY} (still busy after 6 tries over 30 s)")
        self.assertEqual((len(b.calls), clock.slept), (6, [1.0, 2.0, 4.0, 8.0, 15.0]))

    def test_a_reads_tries_share_one_busy_window(self):
        """_agent_read's tries share one busy window, set before the first, where each got-timeout retry got a fresh
        30 s (the fresh review of 5771141b, finding 2): a read busy through four asks, then a got timeout and its 2 s,
        then busy again is asked only until the one window's end, 30 s from its first ask."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import GuestControl, ProxmoxError

        timeout = "500 Internal Server Error: VM 711 qga command 'guest-file-read' failed - got timeout"
        clock = self._clock()
        b = self._answering([RuntimeError(self.BUSY)] * 4 + [RuntimeError(timeout)] + [RuntimeError(self.BUSY)] * 10)
        with mock.patch.object(proxmox, "time", clock), self.assertRaises(ProxmoxError) as cm:
            GuestControl(b, agent_busy_s=30.0).file_read(self.c1, "C:\\x")
        self.assertIn(f"{self.BUSY} (still busy after 5 tries over 30 s)", str(cm.exception))
        self.assertEqual((len(b.calls), clock.slept), (10, [1.0, 2.0, 4.0, 8.0, proxmox.FILE_READ_PAUSES[0], 1.0, 2.0, 4.0, 6.0]))
        self.assertEqual(clock.t, 30.0)

    def test_any_other_agent_error_is_the_callers_at_once(self):
        """Only the busy answer is asked again: an unrelated 500 (the VM itself not running) and the agent's own "got
        timeout" out of an exec are raised at their first answer, unchanged. With no window, the tests' and fakes'
        default (Settings gives the lab's), the busy answer is raised at once too."""
        from unittest import mock

        from labapi import proxmox
        from labapi.proxmox import GuestControl, ProxmoxError

        clock = self._clock()
        for answer in ("500 Internal Server Error: VM 711 is not running",
                       "500 Internal Server Error: VM 711 qga command 'guest-exec' failed - got timeout"):
            b = self._answering([RuntimeError(answer), "never asked"])
            with self.subTest(answer=answer), mock.patch.object(proxmox, "time", clock), self.assertRaises(ProxmoxError) as cm:
                GuestControl(b, agent_busy_s=30.0).exec(self.c1, ["cmd"], 5)
            self.assertEqual(str(cm.exception), f"E_PVE_EXEC: sky-c1: RuntimeError: {answer}")
            self.assertEqual(len(b.calls), 1)
        b = self._answering([RuntimeError(self.BUSY), "never asked"])
        with mock.patch.object(proxmox, "time", clock), self.assertRaises(ProxmoxError) as cm:
            GuestControl(b).exec(self.c1, ["cmd"], 5)
        self.assertEqual(str(cm.exception), f"E_PVE_EXEC: sky-c1: RuntimeError: {self.BUSY}")
        self.assertEqual((len(b.calls), clock.slept), (1, []))

    def test_agent_ping_is_one_ping_never_asked_again(self):
        """Runner._removed's window pings the agent between its pauses: one guest-ping, Proxmox's own check, a busy agent
        reading False, and never an unmanaged guest's."""
        from labapi.proxmox import ProxmoxError

        self.pve.agent_up = False
        self.assertFalse(self.control.agent_ping(self.c1))
        self.pve.agent_up = True
        self.assertTrue(self.control.agent_ping(self.c1))
        self.assertEqual(self.pve.calls, [("agent_ping", 711)] * 2)
        with self.assertRaises(ProxmoxError):
            self.control.agent_ping(self.fen)
        self.assertEqual(len(self.pve.calls), 2)

    def test_a_ranged_read_keeps_to_managed_guests_and_the_agents_bounds(self):
        """Agent.pm's file-read takes a count of 1 to 16 MiB and an offset of 0 or more; the fake answers as it does,
        the bytes from the offset, fewer where the file ends, none from an offset at or past its end."""
        from labapi.proxmox import FILE_READ_MAX, ProxmoxError

        self.pve.files["C:\\x.copy"] = "abcé"
        for call in (lambda: self.control.file_read_range(self.fen, "C:\\x.copy", 0, 1),
                     lambda: self.control.file_read_range(self.c1, "C:\\x.copy", 0, 0),
                     lambda: self.control.file_read_range(self.c1, "C:\\x.copy", 0, FILE_READ_MAX + 1),
                     lambda: self.control.file_read_range(self.c1, "C:\\x.copy", -1, 1)):
            with self.assertRaises(ProxmoxError):
                call()
        self.assertEqual(self.pve.calls, [])
        self.assertEqual(self.control.file_read_range(self.c1, "C:\\x.copy", 1, 3), b"bc\xc3")
        self.assertEqual(self.control.file_read_range(self.c1, "C:\\x.copy", 3, 9), b"\xc3\xa9")
        self.assertEqual(self.control.file_read_range(self.c1, "C:\\x.copy", 5, 9), b"")
        self.assertEqual(self.control.file_read_range(self.c1, "C:\\x.copy", 99, 9), b"")

    def test_empty_snapshot_name_is_refused(self):
        from labapi.guests import Guest
        from labapi.proxmox import ProxmoxError

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "", None)
        with self.assertRaises(ProxmoxError):
            self.control.rollback(g, g.snapshot)


@needs_deps
class ProxmoxerExecTests(unittest.TestCase):
    """The real backend's exec loop against a scripted guest agent."""

    def _backend(self, statuses):
        from labapi.proxmox import ProxmoxerGuests

        class Agent:
            def __init__(self):
                self.exec = self
                self.left = list(statuses)

            def post(self, command):
                return {"pid": 42}

            def __call__(self, name):
                assert name == "exec-status"
                return self

            def get(self, pid):
                st = self.left.pop(0) if len(self.left) > 1 else self.left[0]
                if isinstance(st, Exception):
                    raise st
                return st

        class Res:
            agent = Agent()

        b = object.__new__(ProxmoxerGuests)
        b._res = lambda guest: Res()
        return b

    def test_exec_status_errors_are_asked_again(self):
        from unittest import mock

        from labapi.guests import Guest

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "clean-m1", "c2")
        b = self._backend([RuntimeError("got timeout"), RuntimeError("got timeout"), {"exited": 1, "exitcode": 0, "out-data": "ok"}])
        with mock.patch("labapi.proxmox.time.sleep"):
            res = b.exec(g, ["cmd"], 5.0)
        self.assertEqual((res.exitcode, res.out), (0, "ok"))

    def test_exec_status_of_a_pid_the_agent_no_longer_knows_ends_at_once(self):
        """The agent reaps a pid once exec-status reports its exit; after an answer lost on its way back
        the pid is unknown for good (sky-c2, run 20261018-204244 spent 120 s asking): no more asking."""
        import time
        from unittest import mock

        from labapi.guests import Guest
        from labapi.proxmox import ProxmoxError

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "clean-m1", "c2")
        gone = RuntimeError("500 Internal Server Error: VM 712 qga command 'guest-exec-status' failed - PID lld does not exist")
        b = self._backend([RuntimeError("got timeout"), gone])
        t0 = time.monotonic()
        with mock.patch("labapi.proxmox.time.sleep"), self.assertRaises(ProxmoxError) as cm:
            b.exec(g, ["cmd"], 120.0)
        self.assertIn("E_PVE_EXEC_LOST: pid 42 on sky-c2", str(cm.exception))
        self.assertIn("does not exist", str(cm.exception))
        self.assertLess(time.monotonic() - t0, 5.0)

    def test_a_started_command_whose_status_stays_busy_is_never_started_again(self):
        """The exec-status busy string (an untested path at 5771141b; its finding 3): once guest-exec has started the
        command, an exec-status answering "QEMU guest agent is not running" to the exec's deadline ends as "did not exit
        in ...; last exec-status error ...", which names the busy answer, and GuestControl._agent must not ask that exec
        again, which would run the command twice: one guest-exec, the error as the backend gave it."""
        from unittest import mock

        from labapi.guests import Guest
        from labapi.proxmox import GuestControl, ProxmoxError

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "clean-m1", "c2")
        b = self._backend([RuntimeError("500 Internal Server Error: QEMU guest agent is not running")])
        agent, started = b._res(g).agent, []
        plain_post = agent.post

        def post(command):
            started.append(command)
            return plain_post(command)

        agent.post = post
        with mock.patch("labapi.proxmox.time.sleep"), self.assertRaises(ProxmoxError) as cm:
            GuestControl(b, agent_busy_s=30.0).exec(g, ["cmd"], 0.05)
        self.assertIn("E_PVE_EXEC: pid 42 on sky-c2 did not exit in 0.05s; last exec-status error RuntimeError: 500 Internal "
                      "Server Error: QEMU guest agent is not running", str(cm.exception))
        self.assertNotIn("still busy after", str(cm.exception))
        self.assertEqual(started, [["cmd"]])

    def test_exec_status_that_never_answers_names_the_last_error(self):
        from unittest import mock

        from labapi.guests import Guest
        from labapi.proxmox import ProxmoxError

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "clean-m1", "c2")
        b = self._backend([RuntimeError("got timeout")])
        with mock.patch("labapi.proxmox.time.sleep"), self.assertRaises(ProxmoxError) as cm:
            b.exec(g, ["cmd"], 0.05)
        self.assertIn("got timeout", str(cm.exception))


@needs_deps
class ProxmoxerFileReadTests(unittest.TestCase):
    """The real backend's ranged read against a scripted agent file-read endpoint answering as qemu-server 9.2.10's
    Agent.pm does (ec268ede5b, lines 512-571): {content, bytes-read}, truncated when it saw no eof, and with decode=0
    the content is the agent's base64 as it came."""

    def _backend(self, answer):
        from labapi.proxmox import ProxmoxerGuests

        asked = []

        class FileRead:
            def get(self, **params):
                asked.append(params)
                return dict(answer)

        class Agent:
            def __call__(self, name):
                assert name == "file-read"
                return FileRead()

        class Res:
            agent = Agent()

        b = object.__new__(ProxmoxerGuests)
        b._res = lambda guest: Res()
        return b, asked

    def _g(self):
        from labapi.guests import Guest

        return Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1")

    def test_a_range_is_asked_undecoded_and_comes_back_as_its_bytes(self):
        import base64

        raw = b"\x00\xff" + "é€".encode("utf-8") + b"\n"
        b, asked = self._backend({"content": base64.b64encode(raw).decode(), "bytes-read": len(raw), "truncated": 1})
        self.assertEqual(b.file_read_range(self._g(), "C:\\x.copy", 524288, len(raw)), raw)
        self.assertEqual(asked, [{"file": "C:\\x.copy", "offset": 524288, "count": len(raw), "decode": 0}])

    def test_an_offset_at_or_past_the_end_answers_no_bytes(self):
        # the agent's read there is 0 bytes with eof: no chunk joins the content, bytes-read stays 0, and no truncated
        b, _ = self._backend({"content": "", "bytes-read": 0})
        self.assertEqual(b.file_read_range(self._g(), "C:\\x.copy", 1048576, 524288), b"")

    def test_a_range_that_is_no_base64_is_refused(self):
        from labapi.proxmox import ProxmoxError

        b, _ = self._backend({"content": "not base64!", "bytes-read": 8, "truncated": 1})
        with self.assertRaises(ProxmoxError) as cm:
            b.file_read_range(self._g(), "C:\\x.copy", 0, 8)
        self.assertIn("E_PVE_FILE: C:\\x.copy on sky-c1: the range at 0 came back as no base64", str(cm.exception))

    def test_a_range_whose_bytes_disagree_with_the_agents_count_is_refused(self):
        import base64

        from labapi.proxmox import ProxmoxError

        b, _ = self._backend({"content": base64.b64encode(b"abc").decode(), "bytes-read": 5})
        with self.assertRaises(ProxmoxError) as cm:
            b.file_read_range(self._g(), "C:\\x.copy", 0, 5)
        self.assertIn("decodes to 3 bytes of the 5 the agent read", str(cm.exception))


@needs_deps
class ProxmoxerTaskTests(unittest.TestCase):
    """The real backend's task wait against a scripted task-status endpoint (2026-10-30 04:23:38Z: an SSLError on
    712's start-task poll failed a run whose start had ended TASK OK)."""

    def _backend(self, statuses):
        from labapi.proxmox import ProxmoxerGuests

        class Status:
            def __init__(self):
                self.left = list(statuses)

            def get(self):
                st = self.left.pop(0) if len(self.left) > 1 else self.left[0]
                if isinstance(st, Exception):
                    raise st
                return st

        status = Status()

        class Task:
            def __init__(self):
                self.status = status

        class Node:
            def tasks(self, upid):
                return Task()

        class Api:
            def nodes(self, node):
                return Node()

        b = object.__new__(ProxmoxerGuests)
        b._api = Api()
        b._node = "core"
        return b

    def test_a_failed_task_read_is_asked_again(self):
        from unittest import mock

        b = self._backend([ConnectionError("SSLError: Max retries exceeded"), {"status": "running"},
                           {"status": "stopped", "exitstatus": "OK"}])
        with mock.patch("labapi.proxmox.time.sleep"):
            self.assertEqual(b._task_end("UPID:core:0000D652:0004CDF5:6AE41BC1:qmstart:712:lab-api@pve!runner:", 5.0), "OK")

    def test_a_task_read_that_never_answers_names_the_last_error(self):
        from unittest import mock

        from labapi.proxmox import ProxmoxError

        b = self._backend([ConnectionError("SSLError: Max retries exceeded")])
        with mock.patch("labapi.proxmox.time.sleep"), self.assertRaises(ProxmoxError) as cm:
            b._task_end("UPID:core:1:qmstart:712", 0.05)
        self.assertIn("unread until", str(cm.exception))
        self.assertIn("SSLError", str(cm.exception))

    def test_a_task_that_failed_still_fails(self):
        from unittest import mock

        b = self._backend([{"status": "stopped", "exitstatus": "start failed: QEMU exited with code 1"}])
        with mock.patch("labapi.proxmox.time.sleep"):
            self.assertEqual(b._task_end("UPID:core:1:qmstart:711", 5.0), "start failed: QEMU exited with code 1")


@needs_deps
class ResetStaggerTests(unittest.TestCase):
    """core's host journal, 2026-10-30: every GPU wedge since August came in a burst where both lab cards reset within
    seconds, and 1,748 single-card bursts never failed; so two seats' stops and starts land reset_stagger_s apart."""

    def _control(self, stagger):
        import time

        from labapi.proxmox import GuestControl

        log = []

        class Backend:
            def stop(self, g):
                log.append(("stop", g.name, time.monotonic()))

            def rollback(self, g, snap):
                log.append(("rollback", g.name, time.monotonic()))

            def start(self, g):
                log.append(("start", g.name, time.monotonic()))

        return GuestControl(Backend(), reset_stagger_s=stagger), log

    def test_two_seats_rollbacks_follow_each_other_a_stagger_apart(self):
        import threading

        from labapi.guests import Guest

        control, log = self._control(0.3)
        seats = [Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1"),
                 Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "clean-m1", "c2")]
        threads = [threading.Thread(target=control.rollback_sequence, args=(g, "clean-m1")) for g in seats]
        for t in threads:
            t.start()
        for t in threads:
            t.join(10)
        names = [e[1] for e in log]
        self.assertEqual(len(log), 6, log)
        self.assertEqual(names, [names[0]] * 3 + [names[3]] * 3, "one seat's stop, rollback and start, then the other's")
        self.assertNotEqual(names[0], names[3])
        self.assertGreaterEqual(log[3][2] - log[2][2], 0.29, "the second seat's stop waits out the stagger after the first's start")

    def test_one_seats_own_stop_and_start_and_a_server_never_wait(self):
        import time

        from labapi.guests import Guest

        control, log = self._control(5.0)
        seat = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1")
        server = Guest("sky-srv", 700, "10.10.70.10", "qemu", "server", True, "", None)
        t0 = time.monotonic()
        control.rollback_sequence(seat, "clean-m1")
        control.stop(server)
        control.start(server)
        self.assertLess(time.monotonic() - t0, 1.0, "no stagger inside one seat's sequence or for a guest with no GPU")


@needs_deps
class SeatStopTests(unittest.TestCase):
    """GuestControl's seat_stop: a client seat stops by an ACPI shutdown PVE forces to a stop when it says shutdown,
    by a hard stop otherwise, and a guest with no GPU (the server) always by a hard stop."""

    def _control(self, **kw):
        from labapi.proxmox import GuestControl

        calls = []

        class Backend:
            def stop(self, g):
                calls.append(("stop", g.name))

            def stop_gently(self, g, timeout_s):
                calls.append(("stop-gently", g.name, timeout_s))

        return GuestControl(Backend(), **kw), calls

    def _guests(self):
        from labapi.guests import Guest

        return (Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1"),
                Guest("sky-srv", 700, "10.10.70.10", "qemu", "server", True, "", None))

    def test_shutdown_mode_stops_a_seat_gently_and_the_server_at_once(self):
        control, calls = self._control(seat_stop="shutdown", seat_shutdown_timeout_s=45)
        seat, server = self._guests()
        control.stop(seat)
        control.stop(server)
        self.assertEqual(calls, [("stop-gently", "sky-c1", 45), ("stop", "sky-srv")])

    def test_the_default_is_the_hard_stop_it_always_was(self):
        control, calls = self._control()
        seat, server = self._guests()
        control.stop(seat)
        self.assertEqual(calls, [("stop", "sky-c1")])


@needs_deps
class TablesTests(unittest.TestCase):
    def test_shipped_tables(self):
        from labapi.config import PKG_DIR
        from labapi.guests import load_tables

        t = load_tables(PKG_DIR / "guests.yaml")
        self.assertEqual(t.guest_for_client("c1").name, "sky-c1")
        self.assertEqual(t.guest_for_client("c2").name, "sky-c2")  # since 2026-10-01; fenestrate is a file source, never a client
        self.assertTrue(t.guest_for_client("c2").managed)
        self.assertFalse(t.guests["fenestrate"].managed)
        self.assertIsNone(t.guests["fenestrate"].client)
        self.assertEqual(t.server_guest().vmid, 700)
        self.assertEqual(t.profile_id("c1"), 1)
        self.assertEqual(t.base_id("Skyrim.esm:IronSword"), 0x12EB7)
        self.assertEqual(t.base_id("0x12EB7"), 0x12EB7)
        self.assertEqual(t.base_id("77495"), 0x12EB7)
        with self.assertRaises(KeyError):
            t.base_id("Skyrim.esm:NotAThing")
        self.assertEqual(t.guests["sky-re"].kind, "lxc")
