"""Self-service snapshots and promotes of the lab clients (thuum-mundus's
recipe and guardrails, 2026-10-05): proxmox.GuestControl.snapshot_clone and
promote_clone over the fake backend, and the endpoints' busy rules."""

import unittest

from _labapi import needs_deps

QUIESCE = "Stop-Process SkyrimSE"


def tree(*names):
    """A clone's snapshot list: each name on top of the one before, then current."""
    out, parent = [], None
    for n in names:
        out.append({"name": n, "parent": parent})
        parent = n
    out.append({"name": "current", "parent": parent})
    return out


@needs_deps
class SnapshotTests(unittest.TestCase):
    def setUp(self):
        from labapi.fakes import FakeProxmox
        from labapi.guests import Guest
        from labapi.proxmox import GuestControl

        self.pve = FakeProxmox()
        self.control = GuestControl(self.pve)
        self.c1 = Guest("sky-c1", 711, "10.10.70.21", "qemu", "client", True, "clean-m1", "c1")
        self.other = Guest("sky-x", 713, "10.10.70.23", "qemu", "client", True, "clean-m1", "c3")

    def names(self, vmid=711):
        return [(e["name"], e["parent"]) for e in self.pve.snaps[vmid]]

    def kinds(self):
        return [c[0] for c in self.pve.calls]

    def test_a_snapshot_quiesces_shuts_down_cleanly_stacks_and_waits_for_the_agent(self):
        self.pve.snaps[711] = tree("clean-sp", "clean-m1")
        out = self.control.snapshot_clone(self.c1, "clean-m1-x", "x", QUIESCE, 60, 5)
        self.assertEqual(out["snapshot"], "clean-m1-x")
        self.assertEqual(out["parent"], "clean-m1")
        self.assertEqual(self.names()[-2:], [("clean-m1-x", "clean-m1"), ("current", "clean-m1-x")])
        k = self.kinds()
        self.assertLess(k.index("exec"), k.index("shutdown"))
        self.assertLess(k.index("shutdown"), k.index("snapshot_create"))
        self.assertLess(k.index("snapshot_create"), k.index("start"))
        self.assertLess(k.index("start"), k.index("agent_ping"))
        self.assertIn(("shutdown", 711, 180), self.pve.calls)
        quiesce = next(c for c in self.pve.calls if c[0] == "exec")
        self.assertIn(QUIESCE, " ".join(quiesce[2]))

    def test_a_snapshot_replaces_its_own_leaf(self):
        self.pve.snaps[711] = tree("clean-sp", "clean-m1", "clean-m1-x")
        self.control.snapshot_clone(self.c1, "clean-m1-x", "again", QUIESCE, 60, 5)
        self.assertIn(("snapshot_delete", 711, "clean-m1-x"), self.pve.calls)
        self.assertEqual(self.names()[-2:], [("clean-m1-x", "clean-m1"), ("current", "clean-m1-x")])

    def test_an_unclean_shutdown_takes_no_snapshot_and_starts_the_clone_again(self):
        from labapi.proxmox import ProxmoxError

        for log in (["VM quit/powerdown failed - got timeout"], ["shutdown timed out, forcing stop"]):
            self.pve.calls.clear()
            self.pve.statuses.pop(711, None)
            self.pve.snaps[711] = tree("clean-sp", "clean-m1")
            self.pve.shutdown_log = log
            with self.assertRaises(ProxmoxError) as e:
                self.control.snapshot_clone(self.c1, "clean-m1-x", "x", QUIESCE, 60, 5)
            self.assertIn("E_PVE_SHUTDOWN", str(e.exception))
            self.assertNotIn("snapshot_create", self.kinds())
            self.assertIn("start", self.kinds())

    def test_a_shutdown_that_leaves_the_clone_running_reports_itself_not_a_start(self):
        """A timed-out shutdown leaves the clone running; a start would fail
        with "already running" and hide E_PVE_SHUTDOWN (thuum-mundus)."""
        from labapi.proxmox import ProxmoxError

        for timed_out, error in ((True, None), (False, "task did not finish")):
            self.pve.calls.clear()
            self.pve.statuses[711] = "running"
            self.pve.snaps[711] = tree("clean-sp", "clean-m1")
            self.pve.shutdown_status = "VM quit/powerdown failed - got timeout" if timed_out else "OK"
            self.pve.shutdown_log = ["VM quit/powerdown failed - got timeout"] if timed_out else []
            self.pve.shutdown_error = error
            with self.assertRaises(ProxmoxError) as e:
                self.control.snapshot_clone(self.c1, "clean-m1-x", "x", QUIESCE, 60, 5)
            self.assertIn("E_PVE_SHUTDOWN", str(e.exception))
            self.assertIn("the clone is running", str(e.exception))
            self.assertNotIn("start", self.kinds())
            self.assertNotIn("snapshot_create", self.kinds())

    def test_a_snapshot_stacks_only_directly_on_clean_m1(self):
        """clean-m1-effects on top of a clean-m1-markers nobody promoted would
        land three deep, a shape neither tool unwinds: refused before the
        quiesce (thuum-mundus)."""
        from labapi.proxmox import ProxmoxError

        for snaps, name in ((tree("clean-sp", "clean-m1", "clean-m1-markers"), "clean-m1-effects"),
                            (tree("clean-sp", "clean-m1", "clean-m1-x", "clean-m1-y"), "clean-m1-y"),
                            (tree("clean-sp"), "clean-m1-x")):
            self.pve.calls.clear()
            self.pve.snaps[711] = snaps
            with self.assertRaises(ProxmoxError, msg=name) as e:
                self.control.snapshot_clone(self.c1, name, "", QUIESCE, 60, 5)
            self.assertIn("directly on clean-m1", str(e.exception))
            self.assertEqual(self.kinds(), ["snapshots"])

    def test_the_guardrails(self):
        from labapi.proxmox import ProxmoxError

        self.pve.snaps[711] = tree("clean-sp", "clean-m1", "clean-m1-x", "clean-m1-y")
        self.pve.snaps[713] = tree("clean-sp", "clean-m1")
        cases = [
            (self.other, "clean-m1-x"),   # not one of the two clones
            (self.c1, "clean-sp"),        # never clean-sp
            (self.c1, "clean-m1"),        # the base comes only from a promote
            (self.c1, "nightly"),         # not a clean-m1 name
            (self.c1, "clean-m1-X!"),
        ]
        for guest, name in cases:
            with self.assertRaises(ProxmoxError, msg=name) as e:
                self.control.snapshot_clone(guest, name, "", QUIESCE, 60, 5)
            self.assertIn("E_PVE_GUARD", str(e.exception))
        self.assertNotIn("shutdown", self.kinds())
        # a name with later snapshots is never replaced, and the clone is
        # never touched
        with self.assertRaises(ProxmoxError) as e:
            self.control.snapshot_clone(self.c1, "clean-m1-x", "", QUIESCE, 60, 5)
        self.assertIn("later snapshots", str(e.exception))
        for kind in ("exec", "shutdown", "snapshot_delete", "start"):
            self.assertNotIn(kind, self.kinds())

    def test_a_promote_makes_the_base_bit_identical_to_the_stacked_snapshot(self):
        self.pve.snaps[711] = tree("clean-sp", "clean-m1", "clean-m1-x")
        self.pve.snaps[711][2]["description"] = "m1-x client, run 1, driver abc"
        out = self.control.promote_clone(self.c1, "clean-m1-x", "clean-m1", 5)
        self.assertEqual(out["to"], "clean-m1")
        self.assertEqual(self.names(), [("clean-sp", None), ("clean-m1", "clean-sp"), ("current", "clean-m1")])
        # the stacked snapshot's description (which build, which driver) lives on
        self.assertEqual(self.pve.snaps[711][1]["description"], "promoted from clean-m1-x by lab-api: m1-x client, run 1, driver abc")
        k = [c for c in self.pve.calls if c[0] in ("stop", "rollback", "snapshot_delete", "snapshot_create", "start")]
        self.assertEqual(k, [("stop", 711), ("rollback", 711, "clean-m1-x"), ("snapshot_delete", 711, "clean-m1-x"),
                             ("snapshot_delete", 711, "clean-m1"), ("snapshot_create", 711, "clean-m1"), ("start", 711)])

    def test_a_promote_needs_the_newest_snapshot_stacked_on_its_target(self):
        from labapi.proxmox import ProxmoxError

        self.pve.snaps[711] = tree("clean-sp", "clean-m1", "clean-m1-x", "clean-m1-y")
        for frm, to in (("clean-m1-x", "clean-m1"),    # not the newest
                        ("clean-m1-y", "clean-m1"),    # stacked on clean-m1-x, not clean-m1
                        ("clean-m1-y", "clean-sp"),    # never clean-sp
                        ("clean-m1", "clean-m1")):
            with self.assertRaises(ProxmoxError, msg=(frm, to)) as e:
                self.control.promote_clone(self.c1, frm, to, 5)
            self.assertIn("E_PVE_GUARD", str(e.exception))
        self.assertNotIn("stop", self.kinds())


@needs_deps
class SnapshotEndpointTests(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path

        from fastapi.testclient import TestClient
        from labapi.app import build_fake, create_app
        from labapi.config import Settings

        self.tmp = Path(tempfile.mkdtemp(prefix="labapi-snap-"))
        (self.tmp / "guests.yaml").write_text(
            "guests:\n"
            "  - {name: sky-c1, vmid: 711, ip: 10.10.70.21, kind: qemu, role: client, managed: true, snapshot: clean-m1, client: c1}\n"
            "clients:\n  c1: {profile_id: 1}\n")
        settings = Settings(results_dir=str(self.tmp / "results"), guests_file=str(self.tmp / "guests.yaml"),
                            heartbeat_timeout_s=5)
        self.services = build_fake(settings)
        self.client = TestClient(create_app(self.services)).__enter__()
        self.services.control._b.snaps[711] = tree("clean-sp", "clean-m1")

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def test_snapshot_and_promote_through_the_api(self):
        r = self.client.post("/lab/clients/c1/snapshot", json={"name": "clean-m1-x"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["snapshot"], "clean-m1-x")
        r = self.client.post("/lab/clients/c1/promote", json={"from": "clean-m1-x", "to": "clean-m1"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(self.services.runner.maintenance)

    def test_a_refusal_is_an_error_and_no_run_starts_during_maintenance(self):
        r = self.client.post("/lab/clients/c1/snapshot", json={"name": "clean-sp"})
        self.assertEqual(r.status_code, 500)
        self.assertIn("E_PVE_GUARD", r.json()["error"])
        self.services.runner.maintenance = "snapshot clean-m1-x of sky-c1"
        r = self.client.post("/lab/run", files={"scenario": ("s.yaml", b"id: s\nclients: [c1]\nsteps:\n  - wait: 1\n", "text/yaml")})
        self.assertEqual(r.status_code, 409)
        self.assertIn("in progress", r.json()["error"])
        r = self.client.post("/lab/clients/c1/promote", json={"from": "clean-m1-x", "to": "clean-m1"})
        self.assertEqual(r.status_code, 409)
