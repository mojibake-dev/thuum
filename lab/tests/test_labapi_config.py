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

