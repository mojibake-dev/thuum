"""lab-api settings from the environment: the Proxmox verification switch
takes booleans or a CA bundle path."""

import os
import unittest

from _labapi import needs_deps


@needs_deps
class VerifySetting(unittest.TestCase):
    def _load(self, value):
        from labapi.config import Settings

        old = os.environ.get("PVE_VERIFY_SSL")
        try:
            if value is None:
                os.environ.pop("PVE_VERIFY_SSL", None)
            else:
                os.environ["PVE_VERIFY_SSL"] = value
            return Settings.from_env().pve_verify_ssl
        finally:
            if old is None:
                os.environ.pop("PVE_VERIFY_SSL", None)
            else:
                os.environ["PVE_VERIFY_SSL"] = old

    def test_booleans_and_paths(self):
        self.assertIs(self._load(None), True)
        self.assertIs(self._load("true"), True)
        self.assertIs(self._load("False"), False)
        self.assertIs(self._load("0"), False)
        self.assertEqual(self._load("/etc/ssl/pve-root-ca.pem"), "/etc/ssl/pve-root-ca.pem")


@needs_deps
class Version(unittest.TestCase):
    def test_the_images_commit_reaches_status(self):
        import os
        from labapi.config import Settings

        os.environ["LABAPI_VERSION"] = "abc1234"
        try:
            self.assertEqual(Settings.from_env().version, "abc1234")
        finally:
            del os.environ["LABAPI_VERSION"]
        self.assertEqual(Settings().version, "dev")


@needs_deps
class StartBox(unittest.TestCase):
    def test_the_start_box_guard_is_off_unless_asked(self):
        """Its 3 s wait after every connect pushed m0-death past the server's 25 s respawn (nightly 20261026-104926,
        145408) and its kHide never closed the box it was written for; CLEAR_START_BOX=1 turns it back on."""
        import os
        from labapi.config import Settings

        self.assertIs(Settings().clear_start_box, False)
        os.environ["CLEAR_START_BOX"] = "1"
        try:
            self.assertIs(Settings.from_env().clear_start_box, True)
        finally:
            del os.environ["CLEAR_START_BOX"]


@needs_deps
class ClientReset(unittest.TestCase):
    def test_the_reset_mode_is_rollback_unless_the_env_says_relaunch_and_nothing_else_loads(self):
        """ADR-036: deploying the relaunch changes nothing until LAB_CLIENT_RESET flips, and a mistyped mode stops
        lab-api at its start."""
        import os
        from labapi.config import Settings

        d = Settings()
        self.assertEqual((d.client_reset, d.relaunch_rollback_every, d.reset_relaunch_tries), ("rollback", 20, 2))
        old = {k: os.environ.get(k) for k in ("LAB_CLIENT_RESET", "LAB_RELAUNCH_ROLLBACK_EVERY")}
        try:
            os.environ["LAB_CLIENT_RESET"] = "relaunch"
            os.environ["LAB_RELAUNCH_ROLLBACK_EVERY"] = "5"
            s = Settings.from_env()
            self.assertEqual((s.client_reset, s.relaunch_rollback_every), ("relaunch", 5))
            os.environ["LAB_CLIENT_RESET"] = ""  # a compose file's empty value is the default
            self.assertEqual(Settings.from_env().client_reset, "rollback")
            for bad in ("relunch", "Relaunch", "none"):
                os.environ["LAB_CLIENT_RESET"] = bad
                with self.subTest(bad=bad), self.assertRaises(ValueError):
                    Settings.from_env()
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_the_seat_stop_is_a_hard_stop_unless_the_env_says_shutdown_and_nothing_else_loads(self):
        """core's question of 2026-10-30 (a hard stop pulls a running NVIDIA driver from under its GPU): the knob
        changes nothing until LAB_SEAT_STOP says shutdown, and a mistyped value stops lab-api at its start."""
        import os
        from labapi.config import Settings

        d = Settings()
        self.assertEqual((d.seat_stop, d.seat_shutdown_timeout_s, d.reset_stagger_s), ("stop", 60, 20.0))
        old = {k: os.environ.get(k) for k in ("LAB_SEAT_STOP", "LAB_SEAT_SHUTDOWN_TIMEOUT_S")}
        try:
            os.environ["LAB_SEAT_STOP"] = "shutdown"
            os.environ["LAB_SEAT_SHUTDOWN_TIMEOUT_S"] = "45"
            s = Settings.from_env()
            self.assertEqual((s.seat_stop, s.seat_shutdown_timeout_s), ("shutdown", 45))
            os.environ["LAB_SEAT_STOP"] = ""
            self.assertEqual(Settings.from_env().seat_stop, "stop")
            for bad in ("shut-down", "Shutdown", "acpi"):
                os.environ["LAB_SEAT_STOP"] = bad
                with self.subTest(bad=bad), self.assertRaises(ValueError):
                    Settings.from_env()
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_every_relaunch_stops_the_launch_task_before_the_game(self):
        """install-lab.ps1 registers sky-lab-launch IgnoreNew and launch.ps1 relaunches a game that exits in its first
        minute, so the task stops first and the start is always a fresh launch.ps1."""
        from labapi.config import Settings

        s = Settings()
        self.assertTrue(s.relaunch_cmd.startswith("Stop-ScheduledTask -TaskName sky-lab-launch"), s.relaunch_cmd)
        self.assertLess(s.relaunch_cmd.index("Stop-ScheduledTask"), s.relaunch_cmd.index("Stop-Process"))
        self.assertTrue(s.relaunch_cmd.endswith("; Start-ScheduledTask -TaskName sky-lab-launch"), s.relaunch_cmd)
        self.assertEqual(s.relaunch_cmd, s.relaunch_stop_cmd + "; " + s.relaunch_start_cmd)
