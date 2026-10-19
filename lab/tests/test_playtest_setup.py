import sys
import unittest
from pathlib import Path

from _labapi import needs_deps

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "lab" / "tools"))

PROFILE = """
id: 24
build: "a train on the stage"
world: playtest-m2-23-20261019T015813Z
hold: {minutes: 180, reason: "playtest twenty-four"}
camp: {teleports: playtest-start}
seats:
  - profile: 1
    spells: [0x0C00186D, 0x0006796F]
    values: {Marksman: 60}
    percentages: {health: 1, magicka: 1, stamina: 1}
    by_hand: "player.addperk 7934b"
  - profile: 2
    spells: [0x00012FD0]
    items:
      - {id: 0x00012E4D, count: 1}
    percentages: {health: 1, magicka: 1, stamina: 1}
streams: {test1: 48989, test2: 49989}
after: {readback: percentages}
"""


@needs_deps
class PlaytestProfile(unittest.TestCase):
    """ADR-040 item 6: a playtest's seats from lab/playtests/<n>.yaml."""

    def load(self, text, n=24):
        import yaml
        from playtest_setup import check_profile

        return check_profile(yaml.safe_load(text), n)

    def test_a_profile_becomes_the_seats_server_side_sets(self):
        from playtest_setup import seat_commands

        p = self.load(PROFILE)
        one = seat_commands(p["seats"][0])
        self.assertEqual([label for label, _ in one], ["AddSpell 0xc00186d", "AddSpell 0x6796f", "SetAV Marksman 60"])
        self.assertEqual(one[0][1], {"kind": "console", "profileId": 1, "name": "AddSpell", "args": [20, 0x0C00186D]})
        self.assertEqual(one[2][1], {"kind": "console", "profileId": 1, "name": "SetAV", "args": [20, "Marksman", 60]})
        two = seat_commands(p["seats"][1])
        self.assertEqual(two[-1][1], {"kind": "console", "profileId": 2, "name": "AddItem", "args": [20, 0x12E4D, 1]})

    def test_what_a_profile_refuses(self):
        from playtest_setup import ProfileError

        bad = [
            PROFILE.replace("id: 24", "id: 25"),
            PROFILE.replace("world: playtest-m2-23-20261019T015813Z", "world: clean"),
            PROFILE.replace("minutes: 180", "minutes: 9000"),
            PROFILE.replace("teleports: playtest-start", "teleports: riverwood"),
            PROFILE.replace("[0x00012FD0]", "[Firebolt]"),
            PROFILE.replace("{Marksman: 60}", "{Marksman: high}"),
            PROFILE.replace("count: 1}", "count: 0}"),
            PROFILE.replace("{health: 1, magicka: 1, stamina: 1}\n    by_hand", "{health: 2, magicka: 1, stamina: 1}\n    by_hand"),
            PROFILE.replace("readback: percentages", "readback: everything"),
            PROFILE.replace("  - profile: 2", "  - profile: 1"),
        ]
        for text in bad:
            with self.assertRaises(ProfileError, msg=text[:80]):
                self.load(text)

    def test_the_camp_is_playtest_start_s_own_two_teleports(self):
        from playtest_setup import camp_teleports

        t = camp_teleports()
        self.assertEqual([x["profileId"] for x in t], [1, 2])
        self.assertTrue(all(x["kind"] == "teleport" and len(x["pos"]) == 3 for x in t))

    def test_every_committed_profile_loads(self):
        from playtest_setup import load_profile

        for f in sorted((ROOT / "lab" / "playtests").glob("*.yaml")):
            with self.subTest(profile=f.name):
                load_profile(int(f.stem))


if __name__ == "__main__":
    unittest.main()
