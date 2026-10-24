import unittest

from _labapi import needs_deps
from pathlib import Path

from _labapi import SMOKE, needs_deps


@needs_deps
class ScenarioTests(unittest.TestCase):
    def test_smoke_file_parses(self):
        from labapi.scenario import load_scenario

        sc = load_scenario(SMOKE.read_text())
        self.assertEqual(sc.id, "smoke-two-players")
        self.assertEqual(sc.clients, ["c1", "c2"])
        self.assertEqual(sc.server.snapshot, "clean")
        self.assertIsNone(sc.server.netem)
        self.assertEqual(sc.timeout_s, 600)
        self.assertEqual(sc.artifacts, ["server.log", "c1.log", "c2.log", "screenshots", "world-diff", "pcap"])
        kinds = [s.kind for s in sc.steps]
        self.assertEqual(kinds.count("assert"), 4)
        self.assertEqual(kinds.count("server"), 1)
        tele = sc.steps[2]
        self.assertEqual((tele.kind, tele.client, tele.action), ("client", "c1", "teleport"))
        self.assertEqual(tele.args, {"cell": "lab-spawn", "x": 0, "y": 0, "z": 0})
        give = next(s for s in sc.steps if s.action == "give")
        self.assertEqual(give.args, {"item": "Skyrim.esm:IngotIron", "count": 1})  # not in the spawn kit (an iron sword is)

    def test_quoted_and_bare_flow_forms_agree(self):
        from labapi.scenario import load_scenario

        bare = "id: t\nclients: [c1]\nsteps:\n  - c1: move {dx: 1, dy: 2}\n"
        quoted = 'id: t\nclients: [c1]\nsteps:\n  - c1: "move {dx: 1, dy: 2}"\n'
        self.assertEqual(load_scenario(bare).steps, load_scenario(quoted).steps)

    def test_rejects_unknown_client_and_verb(self):
        from labapi.scenario import load_scenario

        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - c9: connect\n")
        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: fly\n")
        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - server: explode\n")

    def test_refs_near_is_a_client_verb_with_its_args(self):
        from labapi.scenario import load_scenario

        block = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: refs-near {radius: 600, from: self, formTypes: [50, 24, 51], ids: [392127]}\n")
        step = block.steps[0]
        self.assertEqual((step.kind, step.client, step.action), ("client", "c1", "refs-near"))
        self.assertEqual(step.args, {"radius": 600, "from": "self", "formTypes": [50, 24, 51], "ids": [392127]})

    def test_until_waits_for_a_condition_with_a_cap(self):
        from labapi.scenario import load_scenario

        block = load_scenario(
            "id: t\nclients: [c1]\nsteps:\n  - until:\n      within: 12\n      expect:\n"
            "        - server.actor(c1).healthPercentage < 0.6\n"
        )
        step = block.steps[0]
        self.assertEqual((step.kind, step.seconds, step.every), ("until", 12.0, 1.0))
        self.assertEqual(step.assertions, ["server.actor(c1).healthPercentage < 0.6"])
        self.assertEqual(step.describe(), "until x1 within 12s")
        flow = load_scenario('id: t\nclients: [c1]\nsteps:\n  - until: {within: 3, every: 0.25, expect: ["server.actor(c1).x > 0"]}\n')
        self.assertEqual((flow.steps[0].seconds, flow.steps[0].every), (3.0, 0.25))
        for bad in (
            "until: [server.actor(c1).x > 0]",
            "until: {expect: [server.actor(c1).x > 0]}",
            "until: {within: 0, expect: [server.actor(c1).x > 0]}",
            "until: {within: 5, expect: []}",
            "until: {within: 5, every: -1, expect: [server.actor(c1).x > 0]}",
            "until: {within: 5, expect: [server.actor(c1).x > 0], until: 3}",
            "until: {within: true, expect: [server.actor(c1).x > 0]}",
        ):
            with self.assertRaises(ValueError, msg=bad):
                load_scenario(f"id: t\nclients: [c1]\nsteps:\n  - {bad}\n")

    def test_npc_enabled_is_the_runs_own_and_a_snapshot_reads_a_server_fact(self):
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: [c1]\nserver: {snapshot: clean, npcEnabled: true}\n"
                           "steps:\n  - server: snapshot {name: predator, of: \"server.ref(0x85547)\"}\n")
        self.assertIs(sc.server.npcEnabled, True)
        self.assertEqual((sc.steps[0].kind, sc.steps[0].action, sc.steps[0].args),
                         ("server", "snapshot", {"name": "predator", "of": "server.ref(0x85547)"}))
        self.assertIsNone(load_scenario("id: t\nclients: []\n").server.npcEnabled)
        for bad in ("server: {npcEnabled: yes please}",
                    "steps:\n  - server: snapshot {name: predator, of: \"c1.state.x\"}",
                    "steps:\n  - server: snapshot {name: 9lives, of: \"server.ref(1)\"}",
                    "steps:\n  - server: snapshot {of: \"server.ref(1)\"}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: t\nclients: [c1]\n{bad}\n")

    def test_the_drivers_cell_events_steps_parse(self):
        # lab-driver's cell-events-start and cell-events-stop (main 4b69e9c, docs/verbs/cell-host.md's Dynamic plan):
        # x-cell-attach was refused at its POST on cell-host's stage (2026-10-21 11:44) for want of these two names
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: cell-events-start\n  - wait: 1\n  - c1: cell-events-stop\n")
        self.assertEqual([s.action for s in sc.steps if s.kind == "client"], ["cell-events-start", "cell-events-stop"])

    def test_a_relaunch_may_return_once_the_player_is_gone(self):
        # b-cell-host 20261021-194846: the host's game came back and took the cell before the check could read the gap
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {until: gone}\n  - c1: connect\n")
        self.assertEqual((sc.steps[0].action, sc.steps[0].args), ("relaunch", {"until": "gone"}))
        # stopped: the kill alone, the server not yet told (b-host-kill times the pass from it)
        sc = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {until: stopped}\n  - c1: connect\n")
        self.assertEqual(sc.steps[0].args, {"until": "stopped"})
        with self.assertRaises(ValueError):
            load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {until: dead}\n")
        both = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {until: gone, files: [{rename: a.dll, to: a.off}]}\n")
        self.assertEqual(both.steps[0].args, {"until": "gone", "files": [{"rename": "a.dll", "to": "a.off"}]})
        for bad in ("relaunch {until: back}", "relaunch {until: true}", "relaunch {when: gone}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: t\nclients: [c1]\nsteps:\n  - c1: {bad}\n")

    def test_a_relaunch_sets_a_key_in_a_json_settings_file(self):
        # npc-puppet's landing hang (2026-10-21): skymp5-client reads its cellHost and npcPuppet switches once at its
        # start, from a JSON file the lab's copy does not carry them in, so the change adds a top-level key; a
        # dotted key names one inside nested objects (gameData.profileId: a seat logging in as the other profile)
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {files: [{json: Data/Platform/Plugins/skymp5-client-settings.txt, "
                           "key: cellHost, value: false}, {json: a.txt, key: server-port, value: 7777}, {json: a.txt, key: x_1, value: 10.10.70.10}, "
                           "{json: a.txt, key: gameData.profileId, value: 2}]}\n")
        self.assertEqual(sc.steps[0].args, {"files": [
            {"json": "Data/Platform/Plugins/skymp5-client-settings.txt", "key": "cellHost", "value": False},
            {"json": "a.txt", "key": "server-port", "value": 7777}, {"json": "a.txt", "key": "x_1", "value": "10.10.70.10"},
            {"json": "a.txt", "key": "gameData.profileId", "value": 2}]})
        for bad in ("{json: ../a.txt, key: k, value: 1}", "{json: a.txt, key: a..b, value: 1}", "{json: a.txt, key: .a, value: 1}", "{json: a.txt, key: a.b.c.d.e, value: 1}", "{json: a.txt, key: a b, value: 1}",
                    "{json: a.txt, key: k, value: [1]}", "{json: a.txt, key: k, value: {a: 1}}", "{json: a.txt, key: k, value: .nan}",
                    "{json: a.txt, key: k, value: \"it's\"}", "{json: a.txt, key: k, value: $x}", "{json: a.txt, key: k}",
                    "{json: a.txt, section: s, key: k, value: 1}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {{files: [{bad}]}}\n")

    def test_a_relaunch_may_arm_a_frida_script_before_the_game_starts(self):
        # x-npc-napi-trace 20261022-071646 attached 1 s after the login's hang: the watcher must be armed while
        # the game is stopped, so the relaunch takes the frida step's arguments
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {until: gone, frida: {script: napi-trace.js, params: {QUIET_S: 3}}}\n")
        self.assertEqual(sc.steps[0].args, {"until": "gone", "frida": {"script": "napi-trace.js", "params": {"QUIET_S": 3}}})
        for bad in ("{frida: {script: ../x.js}}", "{frida: {script: x.txt}}", "{frida: {params: {}}}", "{frida: {script: x.js, every: 1}}",
                    "{frida: x.js}", "{frida: {script: x.js, params: [1]}}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: t\nclients: [c1]\nsteps:\n  - c1: relaunch {bad}\n")

    def test_a_playtest_reads_a_world_actor_and_switches_its_ai(self):
        # playtest thirty's spinning wolves (2026-10-21): the copies near a seat, one's engine state, its AI off and on
        from labapi.scenario import playtest_step

        self.assertEqual(playtest_step("refs-near {radius: 2000, formTypes: [0x2B]}"), ("refs-near", {"radius": 2000, "formTypes": [43]}))
        self.assertEqual(playtest_step("npc-state {formId: 0xff000a12}")[0], "npc-state")
        self.assertEqual(playtest_step("npc-ai {formId: 0xff000a12, enabled: false}"), ("npc-ai", {"formId": 0xFF000A12, "enabled": False}))
        with self.assertRaises(ValueError):
            playtest_step('console {text: "tai"}')

    def test_a_runs_own_game_hour_and_the_puppet_steps(self):
        # docs/verbs/npc-puppet.md's b-npc-puppet and x-npc-puppet-2
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: [c1]\nserver: {snapshot: clean, npcEnabled: true, gameHour: 7.9}\n"
                           "steps:\n  - c1: npc-puppet {puppet: true}\n  - c1: npc-pose {x: 0, y: -950, z: 0, angleZ: 90, speed: 200, direction: 0}\n")
        self.assertEqual((sc.server.gameHour, sc.server.npcEnabled), (7.9, True))
        self.assertEqual([st.action for st in sc.steps], ["npc-puppet", "npc-pose"])
        self.assertIsNone(load_scenario("id: t\nclients: []\n").server.gameHour)
        for bad in ("server: {gameHour: 24}", "server: {gameHour: -1}", "server: {gameHour: dawn}", "server: {gameHour: true}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: t\nclients: [c1]\n{bad}\n")

    def test_netem_spec(self):
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: []\nserver: {snapshot: s, netem: {delay_ms: 60, jitter_ms: 15, loss_pct: 0.5}}\n")
        self.assertEqual((sc.server.netem.delay_ms, sc.server.netem.jitter_ms, sc.server.netem.loss_pct), (60, 15, 0.5))

    def test_a_netem_step_takes_the_spec_s_own_keys_and_nothing_else(self):
        from labapi.scenario import load_scenario

        sc = load_scenario("id: t\nclients: []\nsteps:\n  - server: netem {loss_pct: 25}\n  - server: netem {loss_pct: 0}\n")
        self.assertEqual([(st.action, st.args) for st in sc.steps], [("netem", {"loss_pct": 25}), ("netem", {"loss_pct": 0})])
        for bad in ("netem {loss: 25}", "netem {}", "netem {loss_pct: 101}", "netem {delay_ms: -5}", "netem {loss_pct: lots}",
                    "netem {loss_pct: true}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: t\nclients: []\nsteps:\n  - server: {bad}\n")


@needs_deps
class AllScenariosParse(unittest.TestCase):
    def test_every_scenario_file_parses(self):
        from labapi.scenario import load_scenario

        root = Path(__file__).resolve().parents[2] / "lab" / "scenarios"
        files = sorted(root.glob("*.yaml"))
        self.assertGreaterEqual(len(files), 6)
        for f in files:
            with self.subTest(scenario=f.name):
                sc = load_scenario(f.read_text())
                self.assertEqual(sc.id, f.stem)
                self.assertTrue(sc.steps)


@needs_deps
class SoloFlag(unittest.TestCase):
    def test_solo_is_read_and_defaults_off(self):
        from labapi.scenario import load_scenario

        self.assertFalse(load_scenario("id: plain\nclients: [c1]\nsteps: []\n").solo)
        self.assertTrue(load_scenario("id: solo-ref\nsolo: true\nclients: [c1]\nsteps: []\n").solo)

    def test_solo_start_is_a_client_step(self):
        """lab-driver's solo-start (ADR-031): the driver loads the template save
        at the main menu and places the player; a solo scenario opens with it
        where a multiplayer one opens with connect."""
        from labapi.scenario import load_scenario

        sc = load_scenario("id: p-ref\nsolo: true\nclients: [c1]\nsteps:\n  - c1: solo-start {x: 0, y: -300, z: 0, rz: 180}\n")
        self.assertEqual(sc.steps[0].action, "solo-start")
        self.assertEqual(sc.steps[0].args["rz"], 180)



@needs_deps
class RepeatStep(unittest.TestCase):
    """ADR-033: a step performed again at a person's rhythm (the driver's repeat)."""

    def load(self, step):
        from labapi.scenario import load_scenario

        return load_scenario("id: x-repeat\nclients: [c1]\nsteps:\n  - c1: " + step + "\n")

    def test_a_repeat_is_normalized_for_the_driver(self):
        sc = self.load("repeat {times: 8, gapMs: [400, 700], step: {hold-key: {code: 199, ms: 800}}, seed: 7}")
        step = sc.steps[0]
        self.assertEqual(step.action, "repeat")
        self.assertEqual(step.args, {"times": 8, "gapMs": [400.0, 700.0], "step": {"action": "hold-key", "args": {"code": 199, "ms": 800}}, "seed": 7})

    def test_one_gap_and_a_string_step(self):
        sc = self.load("repeat {times: 3, gapMs: 500, step: 'tap-key {code: 57}'}")
        self.assertEqual(sc.steps[0].args, {"times": 3, "gapMs": [500.0, 500.0], "step": {"action": "tap-key", "args": {"code": 57}}})

    def test_what_repeat_refuses(self):
        for bad in ("repeat {times: 0, gapMs: 400, step: {tap-key: {code: 57}}}",
                    "repeat {times: 101, gapMs: 400, step: {tap-key: {code: 57}}}",
                    "repeat {times: 2.5, gapMs: 400, step: {tap-key: {code: 57}}}",
                    "repeat {times: 3, gapMs: [700, 400], step: {tap-key: {code: 57}}}",
                    "repeat {times: 3, gapMs: [400, 70000], step: {tap-key: {code: 57}}}",
                    "repeat {times: 3, gapMs: 400}",
                    "repeat {times: 3, gapMs: 400, step: {console: {text: qqq}}}",
                    "repeat {times: 3, gapMs: 400, step: {repeat: {times: 2}}}"):
            with self.assertRaises(ValueError, msg=bad):
                self.load(bad)


@needs_deps
class MouseStep(unittest.TestCase):
    """A relative mouse move in the seat's desktop session (lab-api's mouse step, mouse.py)."""

    def load(self, step):
        from labapi.scenario import load_scenario

        return load_scenario("id: x-mouse\nclients: [c1]\nsteps:\n  - c1: " + step + "\n")

    def test_a_move_is_normalized_with_its_defaults(self):
        step = self.load("mouse {dy: 300}").steps[0]
        self.assertEqual((step.kind, step.action), ("client", "mouse"))
        self.assertEqual(step.args, {"dx": 0, "dy": 300, "steps": 8, "ms": 16, "wake": 0})
        step = self.load("mouse {dx: -40, dy: 120, steps: 4, ms: 0, wake: 400}").steps[0]
        self.assertEqual(step.args, {"dx": -40, "dy": 120, "steps": 4, "ms": 0, "wake": 400})

    def test_what_mouse_refuses(self):
        for bad in ("mouse {}", "mouse {dx: 0, dy: 0}", "mouse {dy: 1.5}", "mouse {dy: true}", "mouse {dy: 20000}",
                    "mouse {dy: 10, steps: 0}", "mouse {dy: 10, steps: 201}", "mouse {dy: 10, ms: -1}",
                    "mouse {dy: 10, wake: 5000}", "mouse {dy: 10, pitch: 30}", "mouse {dy: 10, steps: 200, ms: 100}"):
            with self.assertRaises(ValueError, msg=bad):
                self.load(bad)




@needs_deps
class NpcKillStep(unittest.TestCase):
    """A seat's own engine kills a named NPC (lab-driver's npc-kill, npc-ai's shape): no hit, no number of the server's."""

    def test_npc_kill_is_a_client_step(self):
        from labapi.scenario import load_scenario

        step = load_scenario("id: x-kill\nclients: [c1]\nsteps:\n  - c1: npc-kill {formId: 0x13483}\n").steps[0]
        self.assertEqual((step.kind, step.client, step.action, step.args), ("client", "c1", "npc-kill", {"formId": 0x13483}))
        # the seat's player as the killer (a protected actor's death, x-npc-death)
        step = load_scenario("id: x-kill\nclients: [c1]\nsteps:\n  - c1: npc-kill {formId: 0x13483, killer: player}\n").steps[0]
        self.assertEqual(step.args, {"formId": 0x13483, "killer": "player"})

    def test_npc_damage_is_a_client_step(self):
        # the host's engine hurts a named NPC with no hit report (npc-fate's H5, x-npc-death v4)
        from labapi.scenario import load_scenario

        step = load_scenario("id: x-hurt\nclients: [c1]\nsteps:\n  - c1: npc-damage {formId: 0x13483, amount: 1000}\n").steps[0]
        self.assertEqual((step.kind, step.client, step.action, step.args), ("client", "c1", "npc-damage", {"formId": 0x13483, "amount": 1000}))

    def test_approach_names_its_npc_distance_and_cell(self):
        # the seat placed a distance from a named NPC, facing her (lab-api's, through the judged teleport)
        from labapi.scenario import load_scenario

        step = load_scenario('id: x-a\nclients: [c1]\nsteps:\n  - c1: approach {formId: 0x13483, distance: 80, cell: "3c:Skyrim.esm"}\n').steps[0]
        self.assertEqual((step.kind, step.client, step.action), ("client", "c1", "approach"))
        self.assertEqual(step.args, {"formId": 0x13483, "distance": 80, "cell": "3c:Skyrim.esm"})
        for bad in ("{formId: 0x13483, distance: 80}", "{distance: 80, cell: lab-spawn}", "{formId: 0x13483, distance: 5, cell: lab-spawn}",
                    "{formId: 0x13483, distance: 80, cell: lab-spawn, speed: 2}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: x-a\nclients: [c1]\nsteps:\n  - c1: approach {bad}\n")

    def test_quit_is_a_seat_step_without_args(self):
        # the game's own quit (the console's qqq, D12-B's clean disconnect), answered by the driver before its keys
        from labapi.scenario import load_scenario

        step = load_scenario("id: x-q\nclients: [c1]\nsteps:\n  - c1: quit\n  - c1: relaunch {until: gone}\n").steps[0]
        self.assertEqual((step.kind, step.client, step.action, step.args), ("client", "c1", "quit", {}))

    def test_approach_may_take_its_cell_from_the_record(self):
        # `cell: record`: the cell the server's record of her stands in, read at the step (x-handoff-door's leg 3)
        from labapi.scenario import load_scenario

        step = load_scenario('id: x-a\nclients: [c1]\nsteps:\n  - c1: approach {formId: 0x13482, distance: 150, cell: record}\n').steps[0]
        self.assertEqual(step.args["cell"], "record")

    def test_a_server_block_may_set_the_runs_respawn_hours(self):
        from labapi.scenario import load_scenario

        s = load_scenario("id: x-r\nclients: [c1]\nserver: {npcEnabled: true, npcRespawnHours: 1}\nsteps:\n  - wait: 1\n")
        self.assertEqual(s.server.npcRespawnHours, 1.0)
        self.assertIsNone(load_scenario("id: x-r\nclients: [c1]\nsteps:\n  - wait: 1\n").server.npcRespawnHours)
        for bad in ("0", "-1", "true", "721", "'one'"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: x-r\nclients: [c1]\nserver: {{npcRespawnHours: {bad}}}\nsteps:\n  - wait: 1\n")

    def test_kill_ref_and_respawn_ref_take_a_form_id(self):
        # a game-file actor killed by the server (its killer a client of the scenario) or put up again at once
        from labapi.scenario import load_scenario

        head = "id: x-k\nclients: [c1, c2]\nsteps:\n  - c1: "
        kill = load_scenario(head + "kill-ref {formId: 0x85547, killer: c2}\n").steps[0]
        self.assertEqual((kill.kind, kill.action, kill.args), ("client", "kill-ref", {"formId": 0x85547, "killer": "c2"}))
        up = load_scenario(head + "respawn-ref {formId: 0x85547, inPlace: true}\n").steps[0]
        self.assertEqual(up.args, {"formId": 0x85547, "inPlace": True})
        for bad in ("kill-ref {formId: 0x85547, killer: c3}", "kill-ref {killer: c2}", "kill-ref {formId: 0x85547, inPlace: true}",
                    "respawn-ref {formId: 0x85547, killer: c2}", "respawn-ref {formId: 0x85547, inPlace: 1}", "respawn-ref {formId: true}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(head + bad + "\n")

    def test_log_count_and_a_restart_that_sets_the_clock(self):
        # a client's log lines counted mid-run, and a restart that lays the clock anew (npc-handoff's reads)
        from labapi.scenario import load_scenario

        sc = load_scenario('id: x-h\nclients: [c2]\nsteps:\n  - c2: log-count {pattern: "moved .* into"}\n  - server: restart {gameHour: 7.9}\n'
                           '  - server: restart\n')
        self.assertEqual((sc.steps[0].kind, sc.steps[0].action, sc.steps[0].args), ("client", "log-count", {"pattern": "moved .* into"}))
        self.assertEqual((sc.steps[1].kind, sc.steps[1].action, sc.steps[1].args), ("server", "restart", {"gameHour": 7.9}))
        self.assertEqual(sc.steps[2].args, {})
        for bad in ("  - c2: log-count {}\n", '  - c2: log-count {pattern: "("}\n', '  - c2: log-count {pattern: x, n: 2}\n',
                    "  - server: restart {gameHour: 25}\n", "  - server: restart {hour: 7}\n"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                load_scenario(f"id: x-h\nclients: [c2]\nsteps:\n{bad}")

    def test_figure_spells_is_a_client_step(self):
        # a figure's added spells against its equipped ones (ADR-046, x-figure-spells)
        from labapi.scenario import load_scenario

        step = load_scenario("id: x-fig\nclients: [c1]\nsteps:\n  - c1: figure-spells {name: test 2}\n").steps[0]
        self.assertEqual((step.kind, step.client, step.action, step.args), ("client", "c1", "figure-spells", {"name": "test 2"}))

    def test_look_at_is_a_client_step(self):
        # the player's view onto a named actor, for a key press on it (x-npc-talk-prompt v3)
        from labapi.scenario import load_scenario

        step = load_scenario("id: x-look\nclients: [c1]\nsteps:\n  - c1: look-at {formId: 0x13483}\n").steps[0]
        self.assertEqual((step.kind, step.client, step.action, step.args), ("client", "c1", "look-at", {"formId": 0x13483}))

@needs_deps
class ScreenshotStep(unittest.TestCase):
    """One shot, or a burst of frames an animation's rate apart (lab-api's screenshot {count, intervalMs}, burst.py)."""

    def load(self, step):
        from labapi.scenario import load_scenario

        return load_scenario("id: x-shot\nclients: [c1]\nsteps:\n  - c1: " + step + "\n")

    def test_a_plain_shot_takes_nothing_and_a_burst_is_normalized(self):
        self.assertEqual(self.load("screenshot").steps[0].args, {})
        step = self.load("screenshot {count: 40}").steps[0]
        self.assertEqual((step.kind, step.action, step.args), ("client", "screenshot", {"count": 40, "intervalMs": 500}))
        self.assertEqual(self.load("screenshot {count: 3, intervalMs: 100}").steps[0].args, {"count": 3, "intervalMs": 100})
        self.assertEqual(self.load("screenshot {count: 61, intervalMs: 1000}").steps[0].args, {"count": 61, "intervalMs": 1000})

    def test_what_a_burst_refuses(self):
        for bad in ("screenshot {intervalMs: 500}", "screenshot {count: 1}", "screenshot {count: 121}", "screenshot {count: 2.5}",
                    "screenshot {count: true}", "screenshot {count: 10, intervalMs: 99}", "screenshot {count: 10, intervalMs: 5001}",
                    "screenshot {count: 62, intervalMs: 1000}", "screenshot {count: 10, fps: 30}"):
            with self.assertRaises(ValueError, msg=bad):
                self.load(bad)

@needs_deps
class PlaytestStepTests(unittest.TestCase):
    def test_a_playtest_step_is_input_normalized_as_a_scenario_s(self):
        from labapi.scenario import playtest_step, step_seconds
        self.assertEqual(playtest_step("equip {formId: 0x12fd0}"), ("equip", {"formId": 0x12FD0}))
        action, args = playtest_step("repeat {times: 12, gapMs: 3000, step: {hold-key: {code: 199, ms: 3000}}}")
        self.assertEqual(action, "repeat")
        self.assertEqual(args["step"], {"action": "hold-key", "args": {"code": 199, "ms": 3000}})
        # twelve 3 s charges with 3 s gaps answer after 72 s; the driver gets half a minute more
        self.assertEqual(step_seconds(action, args, 60.0), 102.0)
        self.assertEqual(step_seconds("equip", {"formId": 1}, 60.0), 60.0)
        # reads go too: a node's scale on the player or its figure
        self.assertEqual(playtest_step('node-scale {node: "NPC Root [Root]", other: true}'), ("node-scale", {"node": "NPC Root [Root]", "other": True}))
        # and whether the player has a spell: known answers a spell form 1 or 0 (Firebolt, playtest twenty)
        self.assertEqual(playtest_step("known {ids: [0x12fd0, 0x0B0A86DF]}"), ("known", {"ids": [0x12FD0, 0x0B0A86DF]}))
        for bad in ('console {text: "tgm"}', "connect", "set-av {name: Health, value: 1}"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                playtest_step(bad)
