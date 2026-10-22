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
    perks: [0x7934B]
    percentages: {health: 1, magicka: 1, stamina: 1}
    by_hand: "the console's player.showracemenu"
  - profile: 2
    spells: [0x00012FD0]
    items:
      - {id: 0x00012E4D, count: 1}
    percentages: {health: 1, magicka: 1, stamina: 1}
streams: {test1: 48989, test2: 49989}
after: {readback: percentages}
"""


def overlay_text_at(settings_text, server, now):
    from playtest_setup import overlay_text

    return overlay_text(settings_text, server, now=now)


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

    def test_an_item_is_topped_up_to_its_count_not_added_again(self):
        from playtest_setup import seat_commands

        seat = self.load(PROFILE.replace("count: 1}", "count: 3}"))["seats"][1]
        items = lambda have: [p for label, p in seat_commands(seat, have) if label.startswith("AddItem")]
        self.assertEqual(items({0x12E4D: 1})[0]["args"], [20, 0x12E4D, 2])   # a restored world's one, topped up to three
        self.assertEqual(items({0x12E4D: 3}), [])                            # already three: nothing given
        self.assertEqual(items({0x12E4D: 5}), [])
        self.assertEqual(items({})[0]["args"], [20, 0x12E4D, 3])

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
            PROFILE.replace("perks: [0x7934B]", "perks: [Overdraw40]"),
            PROFILE.replace("perks: [0x7934B]", "perks: [0]"),
        ]
        for text in bad:
            with self.assertRaises(ProfileError, msg=text[:80]):
                self.load(text)

    def test_a_profiles_own_server_setting_is_laid_over_the_deployed_file(self):
        import json

        from playtest_setup import ProfileError, overlay_text

        p = self.load(PROFILE + "server: {npcEnabled: true}\n")
        laid = json.loads(overlay_text('{"name": "thuum lab", "loadOrder": ["a.esm"], "npcEnabled": false}', p["server"]))
        self.assertEqual(laid, {"name": "thuum lab", "loadOrder": ["a.esm"], "npcEnabled": True})
        for bad in ("server: {npcEnabled: yes please}\n", "server: {port: 7778}\n", "server: [npcEnabled]\n",
                    "server: {gameHour: 24}\n", "server: {gameHour: true}\n", "server: {gameHour: morning}\n"):
            with self.assertRaises(ProfileError, msg=bad):
                self.load(PROFILE + bad)

    def test_a_profiles_hour_is_the_clocks_time_block(self):
        # playtest thirty-one's morning (thuum-magnus, 2026-10-22): the runner's own shape for a run's gameHour, the
        # epoch at setup and start.hour at the hour, the deployed block's other keys kept
        import json

        p = self.load(PROFILE + "server: {npcEnabled: true, gameHour: 7.9}\n")
        deployed = '{"npcEnabled": false, "time": {"mode": "real", "timeScale": 20, "start": {"year": 201, "hour": 12}}}'
        laid = json.loads(overlay_text_at(deployed, p["server"], 1792674000.0))
        self.assertTrue(laid["npcEnabled"])
        self.assertEqual(laid["time"], {"mode": "real", "timeScale": 20, "epoch": "2026-10-22T13:00:00Z",
                                        "start": {"year": 201, "hour": 7.9}})
        self.assertNotIn("gameHour", laid)

    def test_a_camp_may_name_its_own_teleports(self):
        from playtest_setup import ProfileError

        listed = PROFILE.replace("camp: {teleports: playtest-start}", "camp:\n  teleports:\n"
                                 "    - {kind: teleport, profileId: 1, cell: \"3c:Skyrim.esm\", pos: [17225, -47204, -128], rot: [0, 0, 0]}\n"
                                 "    - {kind: teleport, profileId: 2, cell: \"3c:Skyrim.esm\", pos: [17375, -47204, -128], rot: [0, 0, 180]}")
        self.assertEqual([t["profileId"] for t in self.load(listed)["camp"]["teleports"]], [1, 2])
        for bad in ("profileId: 1, cell", "kind: teleport, profileId: one, cell"):
            with self.subTest(bad=bad), self.assertRaises(ProfileError):
                self.load(listed.replace("kind: teleport, profileId: 1, cell", bad, 1))
        for bad in ("pos: [17225, -47204, -128]", "rot: [0, 0, 0]"):
            with self.subTest(bad=bad), self.assertRaises(ProfileError):
                self.load(listed.replace(bad, bad.split(":")[0] + ": [1, 2]", 1))

    def test_a_seats_perks_go_to_the_client_that_plays_its_profile(self):
        from playtest_setup import ProfileError, seat_client

        self.assertEqual(self.load(PROFILE)["seats"][0]["perks"], [0x7934B])
        self.assertEqual((seat_client(1), seat_client(2)), ("c1", "c2"))
        with self.assertRaises(ProfileError):
            seat_client(9)

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
