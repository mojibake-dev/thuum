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
