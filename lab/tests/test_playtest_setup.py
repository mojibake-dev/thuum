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

    def test_a_seats_globals_go_out_as_the_servers_set_global(self):
        from playtest_setup import ProfileError, seat_commands

        text = PROFILE.replace("    by_hand:", "    globals: [{form: \"828:ccQDRSSE001-SurvivalMode.esl\", value: 0}]\n    by_hand:")
        one = seat_commands(self.load(text)["seats"][0])
        self.assertEqual(one[-1], ("SetGlobal 828:ccQDRSSE001-SurvivalMode.esl 0",
                                   {"kind": "console", "profileId": 1, "name": "SetGlobal", "args": [20, "828:ccQDRSSE001-SurvivalMode.esl", 0]}))
        for bad in ("{form: 828, value: 0}", "{form: \"828\", value: 0}", "{form: \"828:x.esl\", value: true}"):
            with self.assertRaises(ProfileError):
                self.load(PROFILE.replace("    by_hand:", f"    globals: [{bad}]\n    by_hand:"))

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
            PROFILE + "lay: {server: m3-canon-4-hands-4c6d9f24, dist: 7c79fc3e}\n",
            PROFILE + "lay: {dist: {branch: m3-canon-4-objtype, sha: 12345678}}\n",   # an unquoted all-digit sha reads as a number
            PROFILE + "lay: {client: canon}\n",
            PROFILE + "lay: {srv: m3-canon-4-hands-4c6d9f24}\n",
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

    def test_a_profiles_switches_are_laid_off_over_the_deployed_file(self):
        # turbo 2 (numidium, 2026-11-02): the deployed settings carry locks, weatherSync, perks and leveling ON for
        # the gates' scenarios; the sitting's server runs them OFF and an item turns its own on
        import json

        from playtest_setup import ProfileError, overlay_text

        p = self.load(PROFILE + "server: {npcEnabled: true, locks: false, weatherSync: false, perks: false, leveling: false}\n")
        deployed = '{"locks": true, "weatherSync": true, "perks": true, "leveling": true, "weather": {"pool": [1]}}'
        laid = json.loads(overlay_text(deployed, p["server"]))
        self.assertEqual(laid, {"locks": False, "weatherSync": False, "perks": False, "leveling": False,
                                "weather": {"pool": [1]}, "npcEnabled": True})
        for bad in ("server: {locks: off please}\n", "server: {perks: 1}\n", "server: {weather: false}\n"):
            with self.assertRaises(ProfileError, msg=bad):
                self.load(PROFILE + bad)

    def test_the_standing_base_is_laid_into_every_profile_from_44(self):
        # Eli, 2026-11-03: "every test should have - no survival - weather synced - rotfern has headshots - no-pause on
        # menus"; a profile that leaves one out gets it, so a copied profile cannot drop it
        from playtest_setup import HEADSHOT_PERK, SURVIVAL_OFF

        bare = PROFILE.replace("id: 24", "id: 44").replace("    values: {Marksman: 60}\n", "").replace("    perks: [0x7934B]\n", "")
        p = self.load(bare, 44)
        self.assertIs(p["server"]["weatherSync"], True)
        for s in p["seats"]:
            self.assertIn(SURVIVAL_OFF, s["globals"])
        one = p["seats"][0]
        self.assertIn(HEADSHOT_PERK, one["perks"])
        self.assertEqual(one["values"]["Marksman"], 60)
        self.assertNotIn("perks", p["seats"][1])  # Prisoner's seat gets no headshot conditions
        # before 44 nothing is laid: the old profiles load as they were written
        self.assertNotIn("weatherSync", self.load(PROFILE).get("server") or {})

    def test_the_survival_prompt_is_standing_answered(self):
        # playtest 46 (2026-11-04): the "Enable Survival Mode?" box froze rotfern's game with the switch (828) already 0;
        # its flag (8DF) is laid answered on every seat beside the switch, and a profile cannot ask it again
        from playtest_setup import SURVIVAL_PROMPTED, ProfileError

        p = self.load(PROFILE.replace("id: 24", "id: 44"), 44)
        for s in p["seats"]:
            self.assertIn(SURVIVAL_PROMPTED, s["globals"])
        bad = PROFILE.replace("id: 24", "id: 44").replace(
            "    by_hand:", "    globals: [{form: \"8df:ccQDRSSE001-SurvivalMode.esl\", value: 0}]\n    by_hand:")
        with self.assertRaises(ProfileError):
            self.load(bad, 44)

    def test_a_profiles_lay_names_the_build(self):
        p = self.load(PROFILE + 'lay: {server: m3-canon-4-hands-4c6d9f24, dist: {branch: m3-canon-4-objtype, sha: "7c79fc3e"}, client: "83a40da3"}\n')
        self.assertEqual(p["lay"]["dist"], {"branch": "m3-canon-4-objtype", "sha": "7c79fc3e"})

    def test_a_cells_last_grant_is_fresh_or_inherited(self):
        # the server's cell-host lines, as playtest 46 logged them (23:07 to 23:09Z): a grant after "is unhosted" or the
        # first one is fresh; one right after another seat's stop is inherited (the stuck pillars' hand-off)
        from playtest_setup import last_grant

        p = "skymp-server-1  | [2026-11-04 23:0{}] [info] PartOne - cell-host: {}"
        fresh_then_handoff = "\n".join([
            p.format("7:10.527", "ff000001 stops hosting cell 371de (epoch 1)"),
            p.format("7:10.531", "cell 371de is unhosted, frozen at its record (epoch 1 kept)"),
            p.format("7:56.991", "ff000001 hosts cell 371de at epoch 2"),
            p.format("9:06.593", "ff000001 stops hosting cell 371de (epoch 2)"),
            p.format("9:06.598", "ff000000 hosts cell 371de at epoch 3"),
        ])
        self.assertEqual(last_grant(fresh_then_handoff, 0x371DE), "inherited")
        self.assertEqual(last_grant("\n".join(fresh_then_handoff.splitlines()[:3]), 0x371DE), "fresh")
        self.assertEqual(last_grant(p.format("0:00.000", "ff000001 hosts cell 371de at epoch 1"), 0x371DE), "fresh")
        self.assertEqual(last_grant(fresh_then_handoff, 0x3C), "none")  # another cell's lines say nothing of it
        self.assertEqual(last_grant(p.format("1:00.000", "ff000000 hosts cell 371def at epoch 1"), 0x371DE), "none")

    def test_roles_names_each_camp_cells_host_from_this_server_process(self):
        # playtest 46's end (2026-11-04 23:52Z on): the run before the last restart ended on a stop, which must not make
        # this process's first grant look inherited; the host is named by the online table, not by its actor id
        import contextlib
        import io
        from unittest import mock

        import playtest_setup as t

        p = "skymp-server-1  | [2026-11-04 {}] [info] {}"
        log = "\n".join([
            p.format("23:30:01.089", "WireServer: listening on :7777 (netcode, unsecure tokens, no password), up to 8 clients"),
            p.format("23:40:00.000", "PartOne - cell-host: ff000000 stops hosting cell 371de (epoch 3)"),
            p.format("23:52:13.118", "WireServer: listening on :7777 (netcode, unsecure tokens, no password), up to 8 clients"),
            p.format("23:53:10.262", "PartOne - cell-host: ff000001 hosts cell 371de at epoch 1"),
        ])
        handoff = "\n".join([log,
                              p.format("23:59:31.168", "PartOne - cell-host: ff000001 stops hosting cell 371de (epoch 1)"),
                              p.format("23:59:31.173", "PartOne - cell-host: ff000000 hosts cell 371de at epoch 2")])
        profile = {"seats": [{"profile": 1, "name": "test 1"}, {"profile": 2, "name": "test 2"}],
                   "camp": {"teleports": [{"profileId": 1, "cell": "371de:Skyrim.esm"}]}}
        online = {"players": [{"actorId": 0xFF000000, "profileId": 1}, {"actorId": 0xFF000001, "profileId": 2}]}

        def read(text, host, epoch):
            def state(payload):
                return online if payload["kind"] == "online" else {"found": True, "hosted": True, "actorId": host, "epoch": epoch}
            out = io.StringIO()
            with mock.patch.object(t, "load_profile", return_value=profile), mock.patch.object(t, "_srv", return_value=text), \
                    mock.patch.object(t, "state", side_effect=state), contextlib.redirect_stdout(out):
                self.assertEqual(t.roles(46), 0)
            return out.getvalue().strip()

        self.assertEqual(read(log, 0xFF000001, 1), "cell 371de: host test 2 (profile 2), epoch 1, its grant fresh; every other seat in it is a guest")
        self.assertEqual(read(handoff, 0xFF000000, 2), "cell 371de: host test 1 (profile 1), epoch 2, its grant inherited; every other seat in it is a guest")

    def test_a_profile_cannot_turn_a_standing_item_off(self):
        from playtest_setup import ProfileError

        p44 = PROFILE.replace("id: 24", "id: 44")
        for bad in (p44 + "server: {weatherSync: false}\n",
                    p44.replace("    by_hand:", "    globals: [{form: \"828:ccQDRSSE001-SurvivalMode.esl\", value: 1}]\n    by_hand:"),
                    p44.replace("values: {Marksman: 60}", "values: {Marksman: 40}")):
            with self.subTest(bad=bad[-60:]), self.assertRaises(ProfileError):
                self.load(bad, 44)

    def test_a_switch_sets_one_key_of_the_running_overlay(self):
        # playtest-switch (numidium, 2026-11-02): one turbo switch over the running overlay, every other key kept
        import json

        from playtest_setup import ProfileError, switched

        running = '{"locks": false, "perks": false, "npcEnabled": true, "time": {"start": {"hour": 7.9}}}'
        self.assertEqual(json.loads(switched(running, "perks", True)),
                         {"locks": False, "perks": True, "npcEnabled": True, "time": {"start": {"hour": 7.9}}})
        for bad in ("npcEnabled", "weather", "gameHour"):
            with self.assertRaises(ProfileError, msg=bad):
                switched(running, bad, True)

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

    def test_a_seats_perks_go_through_the_servers_add_perk_under_the_switch(self):
        # playtest 44 (2026-11-03): the driver's Papyrus addPerk was refused by the server every 5 s (E_PERK_POINTS at
        # level 1) and the resent state stripped Overdraw40, so headshots failed "occasionally"; the record path spends
        # no points and PerkState restores it at every login
        from playtest_setup import PLAYER, perk_commands, perks_switch_on

        cmds = perk_commands(1, [0x7934B, 0x58F61])
        self.assertEqual([c[1] for c in cmds], [
            {"kind": "console", "profileId": 1, "name": "AddPerk", "args": [PLAYER, 0x7934B]},
            {"kind": "console", "profileId": 1, "name": "AddPerk", "args": [PLAYER, 0x58F61]},
        ])
        self.assertTrue(perks_switch_on('{"perks": true}', '{"perks": false}'))
        self.assertFalse(perks_switch_on('{"locks": true}', '{"perks": false}'))
        self.assertTrue(perks_switch_on(None, '{"perks": true}'))
        self.assertFalse(perks_switch_on("not json", "also not"))

    def test_a_refused_standing_perk_is_a_ready_failure(self):
        from playtest_setup import perk_refusals

        log = ("[2026-11-04 01:04:27.100] [warning] [verb:perks] E_PERK_POINTS: ff000000 picks 7934b at level 1 with 0 perk(s); refused, its state resent\n"
               "[2026-11-04 01:04:32.100] [info] [verb:perks] state ff000000: 0 perk(s)\n"
               "[2026-11-04 01:04:33.000] [warning] [verb:perks] E_PERK_POINTS: ff000001 picks 58f61 at level 1 with 0 perk(s); refused, its state resent\n")
        self.assertEqual(len(perk_refusals(log, [0x7934B])), 1)
        self.assertEqual(len(perk_refusals(log, [0x7934B, 0x58F61])), 2)
        self.assertEqual(perk_refusals(log, [0x1234]), [])
        self.assertEqual(perk_refusals("", [0x7934B]), [])

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
