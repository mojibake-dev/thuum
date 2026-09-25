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

    def test_empty_snapshot_name_is_refused(self):
        from labapi.guests import Guest
        from labapi.proxmox import ProxmoxError

        g = Guest("sky-c2", 712, "10.10.70.22", "qemu", "client", True, "", None)
        with self.assertRaises(ProxmoxError):
            self.control.rollback(g, g.snapshot)


@needs_deps
class TablesTests(unittest.TestCase):
    def test_shipped_tables(self):
        from labapi.config import PKG_DIR
        from labapi.guests import load_tables

        t = load_tables(PKG_DIR / "guests.yaml")
        self.assertEqual(t.guest_for_client("c1").name, "sky-c1")
        self.assertEqual(t.guest_for_client("c2").name, "fenestrate")
        self.assertFalse(t.guest_for_client("c2").managed)
        self.assertEqual(t.server_guest().vmid, 700)
        self.assertEqual(t.profile_id("c1"), 1)
        self.assertEqual(t.base_id("Skyrim.esm:IronSword"), 0x12EB7)
        self.assertEqual(t.base_id("0x12EB7"), 0x12EB7)
        self.assertEqual(t.base_id("77495"), 0x12EB7)
        with self.assertRaises(KeyError):
            t.base_id("Skyrim.esm:NotAThing")
        self.assertEqual(t.guests["sky-re"].kind, "lxc")
