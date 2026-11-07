import unittest

from _labapi import needs_deps


class Server:
    """A ServerFacade with fixed labState answers."""

    def __init__(self):
        self.actors = {"c1": {"found": True, "x": 290.0, "y": 0.0, "z": 0.0, "cell": "lab-spawn"}, "c2": {"found": True, "x": 200.0, "y": 0.0, "z": 0.0, "cell": "lab-spawn"}}
        self.inventories = {"c1": [{"baseId": 0x12EB7, "count": 1}], "c2": []}
        self.items = {"skyrim.esm:ironsword": 0x12EB7}

    def actor(self, client):
        return self.actors.get(client)

    def inventory(self, client):
        return self.inventories.get(client)

    def base_id(self, spec):
        try:
            return int(spec, 0)
        except ValueError:
            return self.items[spec.lower()]

    def time(self):
        return {"found": True, "year": 201, "month": 8, "day": 2, "hour": 14.25, "daysPassed": 16.26, "timeScale": 20.0}


class Views:
    def __init__(self):
        self.data = {"c2": {"self": {"x": 200, "y": 0, "z": 0}, "sees": {"c1": {"x": 300.0, "y": 1.0, "z": 0.0}}}, "c1": {"sees": {"c2": {"x": 200.0, "y": 0.0, "z": 0.0}}}}

    def view(self, observer):
        return self.data.get(observer)


@needs_deps
class EvaluatorTests(unittest.TestCase):
    def setUp(self):
        from labapi.assertions import Evaluator

        self.ev = Evaluator(Server(), Views(), ["c1", "c2"])

    def test_readings_name_each_value_read(self):
        self.assertTrue(self.ev.evaluate("abs(server.actor(c1).x - 300) < 50 and c1.sees(c2)"))
        self.assertTrue(self.ev.evaluate('server.inventory(c1).count("Skyrim.esm:IronSword") == 1'))
        self.assertEqual(self.ev.readings, {
            "server.actor(c1).x": 290.0,
            "c1.sees(c2)": True,
            "server.inventory(c1).count('Skyrim.esm:IronSword')": 1,
        })

    def test_smoke_expressions(self):
        for expr in [
            'server.actor(c2).cell == "lab-spawn"',
            "c1.sees(c2) == true",
            "c2.sees(c1) == true",
            "abs(server.actor(c1).x - 300) < 50",
            "abs(c2.view(c1).x - server.actor(c1).x) < 50",
            'server.inventory(c1).count("Skyrim.esm:IronSword") == 1',
            'server.inventory(c2).count("Skyrim.esm:IronSword") == 0',
            "server.inventory(c1).count(\"0x12EB7\") == 1",
            "not c2.sees(c1) == false",
            "server.actor(c1).x > 100 and server.actor(c2).x < 250",
        ]:
            self.assertTrue(self.ev.evaluate(expr), expr)
        self.assertFalse(self.ev.evaluate("server.actor(c1).x == 12345"))

    def test_the_server_s_running_effects_by_their_mgef(self):
        from labapi.assertions import AssertionData

        # FortifyHealth05's AlchFortifyHealth (Skyrim.esm 0x3EAF3), 100 with
        # 27.5 s left, and an older 20 of it with 3 s
        self.ev._server_facade.actors["c1"]["effects"] = [
            {"effect": 0x3EAF3, "source": 0xFF9FC, "magnitude": 100.0, "secondsLeft": 27.5},
            {"effect": 0x3EAF3, "source": 0x3EAF2, "magnitude": 20.0, "secondsLeft": 3.0},
        ]
        self.ev._server_facade.actors["c2"]["effects"] = []
        for expr in [
            'server.effects(c1).left("0x3eaf3") > 20',
            'server.effects(c1).magnitude("0x3eaf3") == 100',
            'server.effects(c1).left("0x3eb15") == 0',
            'server.effects(c2).left("0x3eaf3") == 0',
        ]:
            self.assertTrue(self.ev.evaluate(expr), expr)
        self.assertEqual(self.ev.readings["server.effects(c1).left('0x3eaf3')"], 27.5)
        # a server without the property reports no list: a data error, not "none"
        del self.ev._server_facade.actors["c2"]["effects"]
        with self.assertRaises(AssertionData):
            self.ev.evaluate('server.effects(c2).left("0x3eaf3") == 0')

    def test_the_game_clock_against_a_client_s_globals(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator

        views = Views()
        views.data["c1"] = {"pos": [0, 0, 0], "gameYear": 201.0, "gameMonth": 8.0, "gameDay": 2.0, "gameHour": 14.27,
                            "gameDaysPassed": 16.261, "timeScale": 20.0}
        ev = Evaluator(Server(), views, ["c1", "c2"])
        for expr in [
            "server.time().timeScale == 20",
            "c1.state.timeScale == server.time().timeScale",
            "abs(c1.state.gameHour - server.time().hour) < 0.05",
            "c1.state.gameDay == server.time().day and c1.state.gameMonth == server.time().month",
            "c1.state.gameYear == server.time().year",
            "abs(c1.state.gameDaysPassed - server.time().daysPassed) < 0.01",
        ]:
            self.assertTrue(ev.evaluate(expr), expr)
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("server.time(c1).hour == 1")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.state.gameHour == 1")  # c2's dump has no globals

        class NoClock(Server):
            def time(self):
                return None

        with self.assertRaises(AssertionData):
            Evaluator(NoClock(), views, ["c1"]).evaluate("server.time().hour == 1")

    def test_a_client_s_player_controls(self):
        """After a long wait in the second playtest a player could look around
        but not move or open menus; lab-driver reports the engine's controls."""
        from labapi.assertions import AssertionData, Evaluator

        views = Views()
        views.data["c1"] = {"pos": [0, 0, 0], "controls": {"movement": False, "menu": False, "looking": True, "activate": False}, "rested": True}
        ev = Evaluator(Server(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate("not c1.state.movementControls and not c1.state.menuControls"))
        self.assertTrue(ev.evaluate("c1.state.lookingControls == true"))
        self.assertFalse(ev.evaluate("c1.state.activateControls"))
        self.assertTrue(ev.evaluate("c1.state.rested"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.state.movementControls")  # c2's dump has no controls

    def test_a_client_s_open_menus(self):
        """Playtest 32: the Talk prompt showed and E did nothing; a probe that activates a resident reads the
        seat's menus (dump-state's) for the Dialogue Menu."""
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator

        views = Views()
        views.data["c1"] = {"pos": [0, 0, 0], "menus": ["HUD Menu", "Dialogue Menu"]}
        ev = Evaluator(Server(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.state.menuOpen("Dialogue Menu")'))
        self.assertFalse(ev.evaluate('c1.state.menuOpen("Inventory Menu")'))
        with self.assertRaises(AssertionData):
            ev.evaluate('c2.state.menuOpen("Dialogue Menu")')  # c2's dump carries no menus
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c1.state.menuOpen(3)")
        # what E acts on: the reference under the crosshair (x-npc-talk-prompt v4 asserts its aim first)
        views.data["c1"]["crosshairRef"] = 0x13483
        self.assertTrue(ev.evaluate("c1.state.crosshairRef == 0x13483"))
        views.data["c2"] = {"pos": [0, 0, 0]}
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.state.crosshairRef == 0")  # a driver before crosshairRef: no pass

    def test_a_clients_log_count_by_its_pattern(self):
        """npc-handoff: a client's own log line ("[verb:npc-handoff] moved <id> into <cell>") counted mid-run."""
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator

        class LogViews(Views):
            def log_count(self, observer, pattern):
                return {"c2": {"moved .* into": 2}}.get(observer, {}).get(pattern)

        ev = Evaluator(Server(), LogViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c2.log_count("moved .* into") == 2'))
        with self.assertRaises(AssertionData):
            ev.evaluate('c2.log_count("stale") == 0')      # never counted with that pattern
        with self.assertRaises(AssertionData):
            ev.evaluate('c1.log_count("moved .* into") > 0')
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c2.log_count(3) == 0")

    def test_a_figures_spells_against_what_it_holds(self):
        """ADR-046: a figure carries only what the server gives it; a distributor's ability shows as an extra."""
        from labapi.assertions import AssertionData, Evaluator

        class SpellViews(Views):
            def figure_spells(self, observer):
                return {"c1": {"formId": 4278192173, "base": 7, "added": [77776, 0x01000817], "equipped": [0, 77776, 0],
                               "extra": [0x01000817]}}.get(observer)

        ev = Evaluator(Server(), SpellViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.figure_spells().count == 2 and c1.figure_spells().extra == 1"))
        self.assertTrue(ev.evaluate("c1.figure_spells().base == 7"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.figure_spells().extra == 0")  # no figure-spells step on c2: no pass

    def test_a_client_s_own_knock_down(self):
        """skymp5-client ragdolls its local player on the server's death state
        and never sets the engine's isDead; lab-driver reports down (m0-death)."""
        from labapi.assertions import AssertionData, Evaluator

        views = Views()
        views.data["c1"] = {"pos": [0, 0, 0], "isDead": False, "down": True}
        ev = Evaluator(Server(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.state.down == true"))
        self.assertTrue(ev.evaluate("c1.state.isDead == false and c1.state.down"))
        views.data["c1"]["down"] = False
        self.assertTrue(ev.evaluate("c1.state.down == false"))
        del views.data["c1"]["down"]
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.state.down == false")  # a driver too old to report it

    def test_rejects_outside_the_language(self):
        from labapi.assertions import AssertionSyntax

        for expr in [
            "server.__class__ == 1",
            "__import__('os').system('true') == 0",
            'open("/etc/passwd") == 1',
            "server.actor(c1).__dict__ == 1",
            "c1.view(c2).cell == 1",
            "server.actor(c1).x.real == 1",
            "[1][0] == 1",
            "(lambda: 1)() == 1",
            "server.actor(c1).x + 'a' == 1",
            "server.actor(c1)",
            "server.actor(c1).x ** 2 == 1",
            "abs(x=1) == 1",
        ]:
            with self.assertRaises(AssertionSyntax, msg=expr):
                self.ev.evaluate(expr)

    def test_missing_data_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator

        server = Server()
        server.actors["c1"] = {"found": False}
        ev = Evaluator(server, Views(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("server.actor(c1).x == 1")
        with self.assertRaises(AssertionData):
            ev.evaluate('server.inventory(c1).count("Skyrim.esm:NoSuchThing") == 0')

    def test_clients_needing_views(self):
        from labapi.assertions import clients_needing_views

        self.assertEqual(clients_needing_views("abs(c2.view(c1).x - server.actor(c1).x) < 50", ["c1", "c2"]), {"c2"})
        self.assertEqual(clients_needing_views("c1.sees(c2) == true and c2.sees(c1) == true", ["c1", "c2"]), {"c1", "c2"})
        self.assertEqual(clients_needing_views('server.actor(c1).cell == "x"', ["c1", "c2"]), set())


class RichServer(Server):
    """labState answers with the M0 fields, and a near list on the views."""

    def __init__(self):
        super().__init__()
        self.actors["c1"].update({"isDead": False, "healthPercentage": 0.5, "hasAppearance": True, "raceId": 79683, "sex": 0,
                                  "appearanceAttempts": 2, "lastAppearanceRaceId": 79683, "lastAppearanceAllowed": True})
        self.actors["c2"].update({"isDead": True, "healthPercentage": 0.0, "hasAppearance": False, "raceId": None, "sex": None})


class NearViews:
    """c2's dump has no sees map, only the driver's near list; c1's dump is its own state."""

    def __init__(self):
        self.data = {
            "c2": {"pos": [200, 0, 0], "near": [
                {"formId": 0xFF000001, "name": "c1", "pos": [295.0, 2.0, 0.0], "distance": 95.0, "raceId": 79683, "sex": 0, "isDead": False, "healthPercentage": 0.5, "equippedRight": 0x12EB7, "equippedLeft": 0},
                {"formId": 0xFF000009, "name": "Guard", "pos": [5000.0, 0.0, 0.0], "distance": 4800.0, "raceId": 1, "sex": 0, "isDead": False, "healthPercentage": 1.0, "equippedRight": 0, "equippedLeft": 0},
            ]},
            "c1": {"pos": [290, 0, 0], "worldOrCell": 60, "cellName": "lab", "isDead": False, "raceId": 79683, "sex": 0,
                   "health": {"value": 50, "percentage": 0.5}, "magicka": {"value": 100, "percentage": 1.0}, "stamina": {"value": 100, "percentage": 1.0},
                   "equippedRight": 0x12EB7, "equippedLeft": 0},
        }

    def view(self, observer):
        return self.data.get(observer)


@needs_deps
class M0VocabularyTests(unittest.TestCase):
    def setUp(self):
        from labapi.assertions import Evaluator
        self.ev = Evaluator(RichServer(), NearViews(), ["c1", "c2"])

    def test_a_references_inventory_reads_its_record(self):
        """the root-cause plan's W4: server.inventory(<ref>) reads a chest's or a body's items from its record,
        and server.inventory(c1) still reads the player's"""
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()
        refs = {0x371E9: {"found": True, "actorId": 0x371E9, "x": 1.0, "y": 2.0, "z": 3.0, "cell": "371de:Skyrim.esm",
                          "inventory": [{"baseId": 0x12EB7, "count": 1}, {"baseId": 0xF, "count": 25}]},
                0x3975B: {"found": True, "actorId": 0x3975B, "x": 0.0, "y": 0.0, "z": 0.0, "cell": "3c:Skyrim.esm",
                          "inventory": None}}
        srv.ref = lambda actor_id: refs.get(actor_id, {"found": False})
        ev = Evaluator(srv, NearViews(), ["c1", "c2"])
        for expr in ('server.inventory(0x371e9).count("0x12eb7") == 1', 'server.inventory(0x371e9).count("0xf") == 25',
                     'server.inventory(0x371e9).count("0x13790") == 0', 'server.inventory(c1).count("Skyrim.esm:IronSword") == 1'):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaises(AssertionData):
            ev.evaluate('server.inventory(0x3975b).count("0xf") == 0')  # a record without the field
        with self.assertRaises(AssertionData):
            ev.evaluate('server.inventory(0x99999).count("0xf") == 0')  # no record

    def test_the_cell_host_table_and_a_ref_and_a_snapshot(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        srv = RichServer()
        srv.actors["c1"]["actorId"] = 0xFF000000
        srv.actors["c2"]["actorId"] = 0xFF000001
        rows = {0x9810: {"found": True, "cell": 0x9810, "hosted": True, "actorId": 0xFF000001, "epoch": 2}}
        srv.cell_host = lambda cell: rows.get(cell, {"found": True, "cell": cell, "hosted": False, "actorId": 0, "epoch": 0})
        refs = {0x85547: {"found": True, "actorId": 0x85547, "x": 10.0, "y": -20.0, "z": 5.0, "cell": "3c:Skyrim.esm",
                          "isDead": False, "healthPercentage": 1.0},
                # a corpse at rest (npc-fate "The body's rest", ADR-067), and one from a server without the property
                0x85549: {"found": True, "actorId": 0x85549, "x": 1.0, "y": 2.0, "z": 3.0, "cell": "3c:Skyrim.esm",
                          "isDead": True, "healthPercentage": 0.0, "bodyAtRest": True, "bodyRestAt": 4567,
                          "changeFormFnv": 0x90b876a, "changeFormAt": 4600},
                0x8554A: {"found": True, "actorId": 0x8554A, "x": 1.0, "y": 2.0, "z": 3.0, "cell": "3c:Skyrim.esm",
                          "isDead": True, "bodyAtRest": None, "bodyRestAt": None}}
        srv.ref = lambda actor_id: refs.get(actor_id, {"found": False})
        kept = {}
        ev = Evaluator(srv, NearViews(), ["c1", "c2"], snapshots=kept)
        for expr in ('server.host(0x9810).hosted == true', 'server.host(0x9810).client == "c2"', "server.host(0x9810).epoch == 2",
                     'server.host(0x1234).hosted == false', 'server.host(0x1234).client == ""',
                     "server.ref(0x85547).x == 10", 'server.ref(0x85547).cell == "3c:Skyrim.esm"', "server.ref(0x85547).isDead == false",
                     "server.ref(0x85549).bodyAtRest == true", "server.ref(0x85549).bodyRestAt == 4567",
                     "server.ref(0x85549).bodyRestAt > 0", "server.ref(0x85549).changeFormFnv == 0x90b876a",
                     "server.ref(0x85549).changeFormAt > 0"):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaises(AssertionData):
            ev.evaluate("server.ref(0x8554a).bodyAtRest == true")   # a server without the property reports neither
        kept["predator"] = ev.value("server.ref(0x85547)")
        refs[0x85547] = dict(refs[0x85547], x=12.0)   # it moved
        self.assertTrue(ev.evaluate('server.ref(0x85547).y == snapshot("predator").y'))
        self.assertFalse(ev.evaluate('server.ref(0x85547).x == snapshot("predator").x'))
        with self.assertRaises(AssertionData):
            ev.evaluate('snapshot("prey").x == 0')             # never taken
        with self.assertRaises(AssertionData):
            ev.evaluate("server.ref(0x99999).x == 0")          # the server holds no record
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("snapshot(1).x == 0")
        bare = Evaluator(RichServer(), NearViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            bare.evaluate("server.host(0x9810).hosted == true")  # a server without the host table

    def test_a_puppets_gaze_and_face_against_its_hosts(self):
        """npc-stream slice 5 (train 54): both seats' npc-state carry the head-track target and the face's expression;
        a build without the getters answers null, which is missing data, never a pass."""
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()

        class GazeViews(NearViews):
            def npc_state(self, observer, form_id):
                base = {"formId": form_id, "aiEnabled": observer == "c1", "inCombat": False, "package": 0, "combatTarget": 0,
                        "staggering": False, "pos": [0, 0, 0]}
                if observer == "c1":
                    return dict(base, gazeTarget=0x14, gazeSlot=2, emotionType=3, emotionValue=50.0, exprOverride=False, exprIndex=10, exprValue=50.0)
                if observer == "c2":
                    return dict(base, gazeTarget=0x14, gazeSlot=2, emotionType=3, emotionValue=50.0, exprOverride=True, exprIndex=10, exprValue=50.0)
                return dict(base, gazeTarget=None)

        ev = Evaluator(srv, GazeViews(), ["c1", "c2", "c3"])
        self.assertTrue(ev.evaluate("c2.npc_state(0x13483).gazeTarget == c1.npc_state(0x13483).gazeTarget"))
        self.assertTrue(ev.evaluate("c2.npc_state(0x13483).exprIndex == c1.npc_state(0x13483).exprIndex and c2.npc_state(0x13483).exprOverride == true"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c3.npc_state(0x13483).gazeTarget == 0x14")   # no getters on that build

    def test_a_shared_quests_stage_on_both_seats(self):
        """x-quest-stage (ADR-056, memo D55 B): c1 sets stage 10 of FreeformRiverwood01 (0x74a83), c2 reads it; a stage
        the step did not name, a quest never read and a form that is no quest are missing data, never a pass."""
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        srv = RichServer()

        class QuestViews(NearViews):
            def quests(self, observer):
                return {"c1": {0x74A83: {"stage": 10, "running": True, "done": {"10": True}}},
                        "c2": {0x74A83: {"stage": 10, "running": True, "done": {"10": True, "20": False}}, 0x39645: None}}.get(observer)

        ev = Evaluator(srv, QuestViews(), ["c1", "c2", "c3"])
        self.assertTrue(ev.evaluate("c2.quest(0x74a83).stage() == c1.quest(0x74a83).stage()"))
        self.assertTrue(ev.evaluate("c2.quest(0x74a83).stageDone(10) and not c2.quest(0x74a83).stageDone(20)"))
        self.assertTrue(ev.evaluate("c2.quest(0x74a83).running()"))
        self.assertEqual(ev.readings[f"c2.quest({0x74A83}).stage()"], 10)   # a reading names the id as the ast holds it
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.quest(0x74a83).stageDone(20)")     # the step did not read stage 20
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.quest(0x39645).stage() == 0")       # no quest of that id in c2's game
        with self.assertRaises(AssertionData):
            ev.evaluate("c3.quest(0x74a83).stage() == 10")      # c3 never read it
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c2.quest(0x74a83).stage(10) == 10")
        with self.assertRaises(AssertionSyntax):
            ev.evaluate('c2.quest("0x74a83").stage() == 10')

    def test_the_servers_fate_against_a_seats_roll(self):
        """npc-fate (ADR-046): the server's roll pushed to both; a seat's engine race and worn items read against it."""
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()
        fates = {0x85547: {"found": True, "actorId": 0x85547, "fated": True, "baseId": 0x23AB5, "level": 9, "raceId": 0x13746,
                           "worn": [0x1391D, 0x13913]}}
        srv.fate = lambda actor_id: fates.get(actor_id, {"found": True, "actorId": actor_id, "fated": False, "baseId": 0,
                                                         "level": 0, "raceId": 0, "worn": []})

        class FateViews(NearViews):
            def npc_state(self, observer, form_id):
                return {"c1": {0x85547: {"formId": 0x85547, "aiEnabled": True, "inCombat": False, "package": 0, "combatTarget": 0,
                                         "staggering": False, "pos": [0, 0, 0], "raceId": 0x13746, "worn": [0x13913, 0x1391D]}},
                        "c2": {0x85547: {"formId": 0x85547, "aiEnabled": False, "inCombat": False, "package": 0, "combatTarget": 0,
                                         "staggering": False, "pos": [0, 0, 0], "raceId": 0x13746, "worn": [0x13913]}}}.get(observer, {}).get(form_id)

        ev = Evaluator(srv, FateViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("server.fate(0x85547).fated == true and server.fate(0x85547).level == 9"))
        self.assertTrue(ev.evaluate("c1.npc_state(0x85547).raceId == server.fate(0x85547).raceId"))
        self.assertTrue(ev.evaluate("c1.npc_state(0x85547).worn == server.fate(0x85547).worn"))   # sorted on both sides
        self.assertFalse(ev.evaluate("c2.npc_state(0x85547).worn == server.fate(0x85547).worn"))  # a seat that rolled its own
        self.assertTrue(ev.evaluate("server.fate(0x13482).fated == false"))
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), FateViews(), ["c1", "c2"]).evaluate("server.fate(0x85547).fated")  # no fate property

    def test_the_records_worn_against_both_seats(self):
        """npc-stream slice 3: a hosted actor's equipment follows its host's engine; server.ref(id).worn reads the
        record's armor and weapons as a seat's npc-state counts them, so a claim compares the three."""
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()
        refs = {0xFF000A03: {"found": True, "actorId": 0xFF000A03, "x": 0.0, "y": 0.0, "z": 0.0, "cell": "3c:Skyrim.esm",
                             "isDead": False, "healthPercentage": 1.0, "worn": [0x13790, 0x12E49]},
                0xFF000A04: {"found": True, "actorId": 0xFF000A04, "x": 0.0, "y": 0.0, "z": 0.0, "cell": "3c:Skyrim.esm",
                             "isDead": False, "healthPercentage": 1.0, "worn": None}}
        srv.ref = lambda actor_id: refs.get(actor_id, {"found": False})

        class WornViews(NearViews):
            def npc_state(self, observer, form_id):
                worn = {"c1": [0x12E49, 0x13790], "c2": [0x12E49]}.get(observer)
                return {"formId": form_id, "aiEnabled": observer == "c1", "inCombat": False, "package": 0, "combatTarget": 0,
                        "staggering": False, "pos": [0, 0, 0], "raceId": 0x13746, "worn": worn} if worn else None

        ev = Evaluator(srv, WornViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("server.ref(0xff000a03).worn == c1.npc_state(0xff000a03).worn"))   # sorted on both sides
        self.assertFalse(ev.evaluate("server.ref(0xff000a03).worn == c2.npc_state(0xff000a03).worn"))  # a seat a hand behind
        with self.assertRaises(AssertionData):
            ev.evaluate("server.ref(0xff000a04).worn == c1.npc_state(0xff000a04).worn")  # the record reported no equipment

    def test_a_players_stream_counters_by_message_type(self):
        """npc-stream slice 4: the server's per-connection counters read as budget rows; a type never sent reads 0,
        and a server without the counters is missing data, not a pass."""
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        srv = RichServer()
        rows = {"c1": [{"t": 53, "accepted": 60, "dropped": 2, "foreign": 0}, {"t": 53, "accepted": 4, "dropped": 0, "foreign": 0},
                       {"t": 5, "accepted": 12, "dropped": 0, "foreign": 1}]}
        srv.stream = lambda client: {"found": True, "actorId": 0xFF000000, "rows": rows[client]} if client in rows else {"found": False}
        ev = Evaluator(srv, NearViews(), ["c1", "c2"])
        for expr in ("server.stream(c1).accepted(53) == 64", "server.stream(c1).dropped(53) == 2", "server.stream(c1).foreign(5) == 1",
                     "server.stream(c1).accepted(54) == 0"):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaises(AssertionData):
            ev.evaluate("server.stream(c2).accepted(53) == 0")   # no counters for that seat
        with self.assertRaises(AssertionSyntax):
            ev.evaluate('server.stream(c1).accepted("53") == 0')  # a type is a number

    def test_the_follow_table(self):
        """npc-handoff's D6: a game follows an actor through a door into a cell it does not host."""
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()
        srv.actors["c1"]["actorId"] = 0xFF000000
        srv.actors["c2"]["actorId"] = 0xFF000001
        rows = {0x3550C: {"found": True, "actorId": 0x3550C, "following": True, "player": 0xFF000000, "cell": 0x133C6}}
        srv.follow = lambda actor_id: rows.get(actor_id, {"found": True, "actorId": actor_id, "following": False, "player": 0, "cell": 0})
        ev = Evaluator(srv, NearViews(), ["c1", "c2"])
        for expr in ("server.follow(0x3550c).following == true", 'server.follow(0x3550c).client == "c1"',
                     "server.follow(0x3550c).cell == 0x133c6", "server.follow(0x13482).following == false",
                     'server.follow(0x13482).client == ""'):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), NearViews(), ["c1", "c2"]).evaluate("server.follow(0x3550c).following")  # no follow table

    def test_the_server_actor_holds_all_three_bars(self):
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()
        srv.actors["c1"].update({"magickaPercentage": 0.25, "staminaPercentage": 0.75})
        ev = Evaluator(srv, NearViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("server.actor(c1).staminaPercentage > 0.7"))  # b-snapback's stamina hold
        self.assertTrue(ev.evaluate("server.actor(c1).magickaPercentage < 0.3"))
        with self.assertRaises(AssertionData):
            ev.evaluate("server.actor(c2).staminaPercentage > 0.5")  # the gamemode did not report it

    def test_form_and_state_and_actor_fields(self):
        for expr in [
            'c1.state.equippedRight == form("Skyrim.esm:IronSword")',
            "abs(c1.state.health.percentage - 0.5) < 0.05" if False else "abs(c1.state.healthPercentage - 0.5) < 0.05",
            "c1.state.magickaPercentage == 1.0",
            "server.actor(c1).hasAppearance == true",
            "server.actor(c1).raceId == 79683",
            "server.actor(c1).appearanceAttempts == 2",
            "server.actor(c1).lastAppearanceAllowed == true",
            "server.actor(c1).lastAppearanceRaceId == server.actor(c1).raceId",
            "server.actor(c2).isDead == true",
            "c1.state.isDead == false",
        ]:
            with self.subTest(expr=expr):
                self.assertTrue(self.ev.evaluate(expr))

    def test_sees_and_view_match_near_to_the_server_position(self):
        self.assertTrue(self.ev.evaluate("c2.sees(c1) == true"))
        self.assertTrue(self.ev.evaluate("abs(c2.view(c1).x - server.actor(c1).x) < 50"))
        self.assertTrue(self.ev.evaluate("c2.view(c1).raceId == server.actor(c1).raceId"))
        self.assertTrue(self.ev.evaluate("c2.view(c1).sex == server.actor(c1).sex"))
        self.assertTrue(self.ev.evaluate('c2.view(c1).equippedRight == form("Skyrim.esm:IronSword")'))
        self.assertTrue(self.ev.evaluate("abs(c2.view(c1).healthPercentage - 0.5) < 0.05"))

    def test_unreported_fields_are_data_errors(self):
        from labapi.assertions import AssertionData, AssertionSyntax
        with self.assertRaises(AssertionData):
            self.ev.evaluate("server.actor(c2).raceId == 1")
        with self.assertRaises(AssertionSyntax):
            self.ev.evaluate("c1.state.secret == 1")
        with self.assertRaises(AssertionSyntax):
            self.ev.evaluate("form(1) == 1")

    def test_state_needs_a_dump(self):
        from labapi.assertions import clients_needing_views
        self.assertEqual(clients_needing_views("c1.state.isDead == true and c2.sees(c1)", ["c1", "c2"]), {"c1", "c2"})


class WatchViews(NearViews):
    """c2 watched two actors: c1, who started at the server's position and
    jumped 5000 units before coming back, and a guard that never moved."""

    def __init__(self, c1_max=5000.0, c1_magicka=None):
        super().__init__()
        self.watches = {
            "c2": {"actors": [
                {"formId": 0xFF000001, "name": "c1", "first": [296.0, 1.0, 0.0], "last": [296.0, 1.0, 0.0], "maxDisplacement": c1_max, "samples": 240,
                 "magicka": c1_magicka if c1_magicka is not None else [[0, 1000000.0]]},
                {"formId": 0xFF000009, "name": "Guard", "first": [5000.0, 0.0, 0.0], "last": [5000.0, 0.0, 0.0], "maxDisplacement": 0.0, "samples": 240},
            ]},
        }

    def watch(self, observer):
        return self.watches.get(observer)


class MarkerViews(NearViews):
    """c1's last markers step read two markers: one on its map with fast
    travel, one not shown."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {str(0x16223): {"visible": True, "canTravel": True},
                            str(0x16224): {"visible": False, "canTravel": False}}}

    def markers(self, observer):
        return self.read.get(observer)


@needs_deps
class MarkerTests(unittest.TestCase):
    def test_marker_reads_the_last_markers_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), MarkerViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.marker(0x16223).visible and c1.marker(0x16223).canTravel"))
        self.assertTrue(ev.evaluate("not c1.marker(0x16224).visible"))

    def test_an_unread_marker_or_client_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), MarkerViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.marker(0x1).visible")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.marker(0x16223).visible")


class KnownViews(NearViews):
    """c1's last known step read Wheat with its first two effects known."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {str(0x4b0ba): 0b0011}}

    def known(self, observer):
        return self.read.get(observer)


@needs_deps
class KnownTests(unittest.TestCase):
    def test_known_reads_the_mask_from_the_last_known_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), KnownViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.known(0x4b0ba) == 3"))
        self.assertTrue(ev.evaluate("c1.known(307386) >= 1"))

    def test_an_unread_ingredient_or_client_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), KnownViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.known(0x1) == 0")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.known(0x4b0ba) == 0")


class FavoriteViews(NearViews):
    """c1's last favorites step: the iron dagger on key 3, Flames a favorite
    without a key, the steel sword no favorite."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {str(0x1397E): 2, str(0x12FCD): -1, str(0x13989): -2}}

    def favorites(self, observer):
        return self.read.get(observer)


@needs_deps
class FavoriteTests(unittest.TestCase):
    def test_favorite_reads_the_key_from_the_last_favorites_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), FavoriteViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.favorite(0x1397E) == 2"))
        self.assertTrue(ev.evaluate("c1.favorite(0x12FCD) == -1"))
        self.assertTrue(ev.evaluate("c1.favorite(0x13989) == -2"))

    def test_an_unread_form_or_client_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), FavoriteViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.favorite(0x1) == -2")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.favorite(0x1397E) == 2")


class HeldViews(NearViews):
    """c1's last held step: one iron ingot, no leather strip."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {str(0x5ACE4): 1, str(0x800E4): 0}}

    def held(self, observer):
        return self.read.get(observer)


@needs_deps
class HeldTests(unittest.TestCase):
    def test_held_reads_the_game_count_from_the_last_held_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), HeldViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.held(0x5ACE4) == 1"))
        self.assertTrue(ev.evaluate("c1.held(0x800E4) == 0"))

    def test_an_unread_form_or_client_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), HeldViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.held(0x1) == 0")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.held(0x5ACE4) == 1")


class InventoryViews(NearViews):
    """c1's last inventory steps of two chests: an iron sword in one, 25 gold and an iron ingot in the other; c2 read
    the first alone, and its game shows it empty."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {0x371E9: {"ref": 0x371E9, "items": {str(0x12EB7): 1}},
                            0x3975B: {"ref": 0x3975B, "items": {str(0xF): 25, str(0x5ACE4): 1}}},
                     "c2": {0x371E9: {"ref": 0x371E9, "items": {}}}}

    def inventory(self, observer, ref_id):
        return (self.read.get(observer) or {}).get(ref_id)


@needs_deps
class InventoryTests(unittest.TestCase):
    """The root-cause plan's W4: c.inventory(<ref>) is a chest as one seat's own game holds it, its count the
    server's own, so a two-seat claim reads each seat's view beside server.inventory(<ref>)."""

    def setUp(self):
        from labapi.assertions import Evaluator
        srv = RichServer()
        srv.items["skyrim.esm:ingotiron"] = 0x5ACE4
        record = {0x371E9: {"found": True, "actorId": 0x371E9, "x": 0.0, "y": 0.0, "z": 0.0, "cell": "371de:Skyrim.esm",
                            "inventory": [{"baseId": 0x12EB7, "count": 1}]}}
        srv.ref = lambda actor_id: record.get(actor_id, {"found": False})
        self.ev = Evaluator(srv, InventoryViews(), ["c1", "c2"])

    def test_a_seat_reads_a_chest_it_reported(self):
        for expr in ('c1.inventory(0x371e9).count("0x12eb7") == 1', 'c1.inventory("0x371e9").count("Skyrim.esm:IronSword") == 1',
                     'c1.inventory(0x3975b).count("0xf") == 25', 'c1.inventory(0x3975b).count("Skyrim.esm:IngotIron") == 1'):
            with self.subTest(expr=expr):
                self.assertTrue(self.ev.evaluate(expr))
        self.assertEqual(self.ev.readings["c1.inventory(225769).count('0x12eb7')"], 1)

    def test_an_absent_item_counts_zero(self):
        self.assertTrue(self.ev.evaluate('c1.inventory(0x371e9).count("0xf") == 0'))
        self.assertTrue(self.ev.evaluate('c2.inventory(0x371e9).count("0x12eb7") == 0'))  # a chest its game shows empty

    def test_two_chests_are_kept_apart(self):
        self.assertTrue(self.ev.evaluate('c1.inventory(0x371e9).count("0xf") == 0 and c1.inventory(0x3975b).count("0xf") == 25'))
        self.assertTrue(self.ev.evaluate('c1.inventory(0x3975b).count("0x12eb7") == 0'))

    def test_each_seats_view_against_the_record(self):
        self.assertTrue(self.ev.evaluate('c1.inventory(0x371e9).count("0x12eb7") == server.inventory(0x371e9).count("0x12eb7")'))
        self.assertFalse(self.ev.evaluate('c2.inventory(0x371e9).count("0x12eb7") == server.inventory(0x371e9).count("0x12eb7")'))

    def test_an_unreported_chest_is_a_data_error(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        for expr in ('c2.inventory(0x3975b).count("0xf") == 0',                     # c2 never read that chest
                     'c1.inventory(0x99999).count("0xf") == 0',
                     'c1.inventory("Skyrim.esm:NoSuchChest").count("0xf") == 0',    # a name no table holds
                     'c1.inventory(0x371e9).count("Skyrim.esm:NoSuchThing") == 0'):
            with self.subTest(expr=expr), self.assertRaises(AssertionData):
                self.ev.evaluate(expr)
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), NearViews(), ["c1"]).evaluate('c1.inventory(0x371e9).count("0xf") == 0')  # no inventory steps
        for expr in ('c1.inventory(1.5).count("0xf") == 0', 'c1.inventory(true).count("0xf") == 0', 'c1.inventory().count("0xf") == 0',
                     "c1.inventory(0x371e9).count(0xf) == 0"):
            with self.subTest(expr=expr), self.assertRaises(AssertionSyntax):
                self.ev.evaluate(expr)


class GlobalViews(NearViews):
    """c1's last globals step (docs/verbs/player-globals.md): the Craftlord's
    unspent points at 3, a global its game lacks."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {"0b1c19:Apocalypse - Magic of Skyrim.esp": 3.0, "123:Missing.esp": None}}

    def globals(self, observer):
        return self.read.get(observer)


@needs_deps
class GlobalTests(unittest.TestCase):
    def test_global_value_reads_the_game_s_value_from_the_last_globals_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), GlobalViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.globalValue("0b1c19:Apocalypse - Magic of Skyrim.esp") == 3'))

    def test_an_unread_or_missing_global_or_client_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), GlobalViews(), ["c1", "c2"])
        for expr in ('c1.globalValue("123:Missing.esp") == 0', 'c1.globalValue("1:Other.esp") == 0',
                     'c2.globalValue("0b1c19:Apocalypse - Magic of Skyrim.esp") == 3'):
            with self.assertRaises(AssertionData):
                ev.evaluate(expr)


class PoisonViews(NearViews):
    """The last poisons steps (docs/verbs/magic-effects.md): c1's Steel Sword
    (0x13989) carries DB03Poison (0x58CFB) with one charge, c1 holds no other
    poisoned stack, and c2 has not reported."""

    def __init__(self):
        super().__init__()
        self.read = {
            "c1": {"poisons": [{"baseId": 0x13989, "poisonId": 0x58CFB, "count": 1, "worn": True, "wornLeft": False}]},
        }

    def poisons(self, observer):
        return self.read.get(observer)


@needs_deps
class PoisonTests(unittest.TestCase):
    def test_poison_reads_the_stack_of_that_item_from_the_last_step(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), PoisonViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.poison(0x13989).count == 1"))
        self.assertTrue(ev.evaluate("c1.poison(0x13989).poisonId == 0x58CFB"))
        # an item with no poisoned stack: none
        self.assertTrue(ev.evaluate("c1.poison(0x12EB7).count == 0"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.poison(0x13989).count == 0")


class ProjectileViews(NearViews):
    """The last projectiles steps (docs/verbs/marksman.md): c1's game holds an
    iron arrow (ArrowIronProjectile 0x3BE11) 320 units off, c2's none in
    its radius, and c2 looked for no bolt."""

    def __init__(self):
        super().__init__()
        self.read = {
            "c1": {"from": 0x14, "refs": {str(0x3BE11): {"formId": 0xFF000F00, "distance": 320.0}}},
            "c2": {"from": 0xFF000ACB, "refs": {str(0x3BE11): None, str(0x3BE12): {"error": "Error: Bad call result 4"}}},
        }

    def projectiles(self, observer):
        return self.read.get(observer)


@needs_deps
class ProjectileTests(unittest.TestCase):
    def test_projectile_reads_the_nearest_reference_from_the_last_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), ProjectileViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.projectile(0x3BE11).distance < 400"))
        self.assertTrue(ev.evaluate("abs(c1.projectile(0x3BE11).distance - 320) < 1"))

    def test_none_found_or_not_looked_for_is_a_data_error(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), ProjectileViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.projectile(0x3BE11).distance < 400")
        # a call the step caught, and a base it did not look for
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.projectile(0x3BE12).distance < 400")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.projectile(0x3BE13).distance < 400")
        # the reference's own form id is not in the language
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c1.projectile(0x3BE11).formId == 1")


class RefsNearViews(NearViews):
    """The last refs-near steps (docs/research/train-29-rows.md row 7c): c1's
    game counts one projectile reference in its cell (50 PROJ: a Frost Rune,
    RuneFrostProjectile 0x5FBBF, which its ids search found 52.5 units off),
    lists an activator (base 0x3E8F0) 55 units off and a disabled placed
    hazard (base 0x5FBC0) 60 units off beside one hazard whose read aborted;
    c2's game found no rune within its radius, lists nothing of the types,
    asked for the reference class 65 by mistake, and its search for one base
    aborted."""

    def __init__(self):
        super().__init__()
        self.read = {
            "c1": {
                "from": 0x14, "pos": [0.0, 0.0, 0.0], "radius": 600, "cell": 0x9A3C,
                "types": {
                    "50": {"inCell": 1},
                    "24": {"inCell": 7, "near": 1, "refs": [
                        {"formId": 0xFF000F10, "baseId": 0x3E8F0, "baseType": 24, "disabled": False, "deleted": False, "pos": [0.0, 55.0, 0.0], "distance": 55.0},
                    ]},
                    "51": {"inCell": 2, "near": 1, "refs": [
                        {"formId": 0xFF000F11, "baseId": 0x5FBC0, "baseType": 51, "disabled": True, "deleted": False, "pos": [0.0, 60.0, 0.0], "distance": 60.0},
                        {"index": 1, "error": "Error: Bad call result 4"},
                    ]},
                },
                "ids": {str(0x5FBBF): {"formId": 0xFF000F12, "distance": 52.5}},
            },
            "c2": {
                "from": 0xFF000ACB, "pos": [0.0, -350.0, 0.0], "radius": 1200, "cell": 0x9A3C,
                "types": {
                    "50": {"inCell": 0},
                    "24": {"inCell": 7, "near": 0, "refs": []},
                    "65": {"inCell": 0, "note": "reference class 65: SKSE filters by the base form's type, ask for 50"},
                },
                "ids": {str(0x5FBBF): None, str(0x3BE12): {"error": "Error: Bad call result 4"}},
            },
        }

    def refs_near(self, observer):
        return self.read.get(observer)


class PuppetViews(RefsNearViews):
    """docs/verbs/npc-puppet.md's facts: c2 (the non-host) read Hod (0x13483) with its AI off and two
    references of the wolf base 0x1e7a0, the engine's own (0x85547) and a runtime copy (0xff00090d);
    c2's watch saw Hod net a quarter turn and a copy spin seven turns, c1's watch carries no heading
    (a driver before it)."""

    def __init__(self):
        super().__init__()
        self.read["c2"]["types"]["43"] = {"inCell": 4, "near": 2, "refs": [
            {"formId": 0x85547, "baseId": 0x1E7A0, "baseType": 43, "disabled": True, "deleted": False, "pos": [0.0, 243.0, 0.0], "distance": 243.0},
            {"formId": 0xFF00090D, "baseId": 0x1E7A0, "baseType": 43, "disabled": False, "deleted": False, "pos": [0.0, 242.0, 0.0], "distance": 242.0},
        ]}
        self.states = {"c1": {0x13483: {"formId": 0x13483, "aiEnabled": True, "package": 0x6C989, "inCombat": False, "combatTarget": 0,
                                        "staggering": False, "pos": [17300.0, -47100.0, -120.0], "head": [0, 0, 0],
                                        "isDead": False, "healthPercentage": 1.0, "isEssential": False, "isProtected": True,
                                        "activationBlocked": False, "cell": 0x9732, "is3DLoaded": True},
                              # a read from a driver before isDead and healthPercentage
                              0x13482: {"formId": 0x13482, "aiEnabled": True, "package": 0, "inCombat": False, "combatTarget": 0,
                                        "staggering": False, "pos": [17000.0, -47000.0, -120.0], "head": [0, 0, 0]}},
                       "c2": {0x13483: {"formId": 0x13483, "aiEnabled": False, "package": 0, "inCombat": False, "combatTarget": 0,
                                        "staggering": False, "pos": [17301.0, -47099.0, -120.0], "head": [0, 0, 0],
                                        "isDead": True, "healthPercentage": 0.0, "activationBlocked": True, "is3DLoaded": False}}}
        self.watches = {
            "c2": {"actors": [
                {"formId": 0x13483, "first": [17300.0, -47100.0, -120.0], "last": [17400.0, -47100.0, -120.0], "maxDisplacement": 130.0, "samples": 240,
                 "turned": -90.0, "headingAtStop": 270.0},
                {"formId": 0xFF00090D, "first": [0.0, 242.0, 0.0], "last": [0.0, 242.0, 0.0], "maxDisplacement": 3.0, "samples": 240,
                 "turned": 2520.0, "headingAtStop": 12.5},
                # a record without the stop position or the signed rotation (an older driver)
                {"formId": 0x13489, "first": [17100.0, -47000.0, -120.0], "maxDisplacement": 0.0, "samples": 240},
            ]},
            "c1": {"actors": [{"formId": 0x13483, "first": [17300.0, -47100.0, -120.0], "last": [17300.0, -47100.0, -120.0],
                               "maxDisplacement": 0.0, "samples": 240}]},
        }

    def npc_state(self, observer, form_id):
        return (self.states.get(observer) or {}).get(form_id)

    def watch(self, observer):
        return self.watches.get(observer)


@needs_deps
class PuppetFactsTests(unittest.TestCase):
    def test_disabled_reads_the_nearest_listed_references_flag(self):
        # x-prop-push v8: a disabled bucket has no collision; the probe claims disabled == false first
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), RefsNearViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.refs_near().disabled(0x5FBC0) == true"))
        self.assertTrue(ev.evaluate("c1.refs_near().disabled(0x3E8F0) == false"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().disabled(0x3E8F0)")

    def test_pos_is_the_nearest_listed_references_position(self):
        # x-prop-drop: two seats' copies of one prop compared where they lie, from the listing's pos rows
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), RefsNearViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.refs_near().pos(0x3E8F0).y == 55.0"))
        self.assertTrue(ev.evaluate("abs(c1.refs_near().pos(0x5FBC0).y - c1.refs_near().pos(0x3E8F0).y) < 32"))
        # the ids search carries no position: a base found by it alone has none
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.refs_near().pos(0x5FBBF).x == 0")
        # a listing without the base has none either
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().pos(0x3E8F0).x == 0")

    def test_a_reference_read_by_its_own_form_id(self):
        # D-S3's trap bodies and the lamp's premise: one reference of a base told apart by its own id
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), RefsNearViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.refs_near().listed(0xFF000F10) == true"))
        self.assertTrue(ev.evaluate("c1.refs_near().listed(0xFF000F99) == false"))
        self.assertTrue(ev.evaluate("c1.refs_near().pos_of(0xFF000F10).y == 55.0"))
        self.assertTrue(ev.evaluate("c1.refs_near().disabled_of(0xFF000F11) == true"))
        self.assertTrue(ev.evaluate("c1.refs_near().disabled_of(0xFF000F10) == false"))
        # by base id, a reference's own reads find nothing: the two kinds of id are never mixed
        self.assertTrue(ev.evaluate("c1.refs_near().listed(0x3E8F0) == false"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.refs_near().pos_of(0x3E8F0).x == 0")
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.refs_near().disabled_of(0xFF000F99)")
        # c2's step listed the activators and found none near: false, not an error
        self.assertTrue(ev.evaluate("c2.refs_near().listed(0xFF000F10) == false"))
        # a step that listed no type looked for no reference: a data error, not a false
        views = RefsNearViews()
        views.read["c2"]["types"] = {}
        bare = Evaluator(RichServer(), views, ["c1", "c2"])
        with self.assertRaises(AssertionData):
            bare.evaluate("c2.refs_near().listed(0xFF000F10)")

    def test_a_seats_npc_state_a_copy_count_and_a_watched_actors_turns(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), PuppetViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).aiEnabled == true"))
        self.assertTrue(ev.evaluate("c2.npc_state(0x13483).aiEnabled == false"))
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).package == 0x6C989 and c2.npc_state(0x13483).inCombat == false"))
        self.assertTrue(ev.evaluate("abs(c1.npc_state(0x13483).x - c2.npc_state(0x13483).x) < 256"))
        # a puppet's death on the seat that did not make it (playtest 32), and an older read without the fields
        self.assertTrue(ev.evaluate("c2.npc_state(0x13483).isDead == true and c2.npc_state(0x13483).healthPercentage == 0"))
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).isDead == false and c1.npc_state(0x13483).healthPercentage > 0.9"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.npc_state(0x13482).isDead")
        # what the engine refuses a death for (x-npc-death): a protected resident, and no read from an older driver
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).isProtected == true and c1.npc_state(0x13483).isEssential == false"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.npc_state(0x13482).isProtected")
        # the Talk prompt's mechanism: the puppet blocked, the live resident not (67256b72's clear)
        self.assertTrue(ev.evaluate("c2.npc_state(0x13483).activationBlocked == true and c1.npc_state(0x13483).activationBlocked == false"))
        # the cell the reference stands in, a door's interior after a crossing (npc-handoff)
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).cell == 0x9732"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.npc_state(0x13483).cell == 0")  # a driver before the cell read
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.npc_state(0x13482).activationBlocked")
        # loaded-ness, a far seat's "no loaded live copy" (an unloaded copy keeps its AI bit on), and no read from an older driver
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).is3DLoaded == true and c2.npc_state(0x13483).is3DLoaded == false"))
        self.assertTrue(ev.evaluate("not (c2.npc_state(0x13483).is3DLoaded and c2.npc_state(0x13483).aiEnabled)"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.npc_state(0x13482).is3DLoaded")
        # the engine's own reference of a base never counts as a copy
        self.assertTrue(ev.evaluate("c2.refs_near().runtime_of(0x1e7a0) == 1"))
        self.assertTrue(ev.evaluate("c2.refs_near().runtime_of(0x13476) == 0"))
        # a walk nets a quarter turn, a spin seven
        self.assertTrue(ev.evaluate("c2.watched_id(0x13483).turns < 2"))
        self.assertTrue(ev.evaluate("c2.watched_id(0xff00090d).turns > 6"))
        self.assertTrue(ev.evaluate("c2.watched_id(0x13483).headingAtStop == 270"))
        for bad in ("c1.watched_id(0x13483).turns < 2",       # a driver before the heading: no pass
                    "c1.npc_state(0x13484).aiEnabled == true",   # never read
                    "c1.refs_near().runtime_of(0x1e7a0) == 0"):  # c1's step listed no actors: a zero would measure nothing
            with self.subTest(bad=bad), self.assertRaises(AssertionData):
                ev.evaluate(bad)

    def test_a_bodys_head_height_and_the_scene_its_seat_runs(self):
        """x-npc-death-freeze: npc-state's head node against the reference tells a body lying (the head near it) from
        one standing or frozen upright (the head about 124 above); x-scene-guest: the scene a seat's own engine runs
        the NPC in, 0 for none. An answer without the head, or a scene read that threw (null), is missing data."""
        from labapi.assertions import AssertionData, Evaluator

        class BodyViews(PuppetViews):
            def __init__(self):
                super().__init__()
                # the host's Hod upright in no scene; the guest's copy dead, lying, in a scene its own engine plays
                self.states["c1"][0x13483].update(head=[17302.0, -47098.0, 4.0], scene=0)
                self.states["c2"][0x13483].update(head=[17340.0, -47080.0, -112.0], scene=0x7E3B1, is3DLoaded=True)
                # an answer without the head, and a scene read that threw
                self.states["c1"][0x13482].pop("head")
                self.states["c1"][0x13482]["scene"] = None

        ev = Evaluator(RichServer(), BodyViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.npc_state(0x13483).headZ - c2.npc_state(0x13483).z < 60"))    # lying
        self.assertFalse(ev.evaluate("c1.npc_state(0x13483).headZ - c1.npc_state(0x13483).z < 60"))   # upright
        self.assertTrue(ev.evaluate("abs(c1.npc_state(0x13483).headX - c1.npc_state(0x13483).x) < 8 "
                                    "and c1.npc_state(0x13483).headY == -47098"))
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).scene == 0 and c2.npc_state(0x13483).scene == 0x7e3b1"))
        for bad, field in (("c1.npc_state(0x13482).headZ < 0", "headZ"), ("c1.npc_state(0x13482).scene == 0", "scene")):
            with self.subTest(bad=bad), self.assertRaisesRegex(AssertionData, f"{field} was not reported"):
                ev.evaluate(bad)

    def test_a_copys_face_node(self):
        """x-fate-dress-bleak v8: npc-state's faceNode, SKSE's NetImmerse.HasNode of the facegen head node on a seat's
        copy, false on the half-built 3D a re-roll left naked and headless (npc-fate.md 1e). A driver without the read
        reports none, which is missing data, not false."""
        from labapi.assertions import AssertionData, Evaluator

        class FaceViews(PuppetViews):
            def __init__(self):
                super().__init__()
                # the host's copy whole, the guest's the half-built one
                self.states["c1"][0x13483]["faceNode"] = True
                self.states["c2"][0x13483]["faceNode"] = False

        ev = Evaluator(RichServer(), FaceViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.npc_state(0x13483).faceNode == true"))
        self.assertFalse(ev.evaluate("c2.npc_state(0x13483).faceNode == true"))
        with self.assertRaisesRegex(AssertionData, "faceNode was not reported"):
            ev.evaluate("c1.npc_state(0x13482).faceNode == true")


    def test_a_watched_actors_signed_rotation_and_where_it_stood_at_the_stop(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), PuppetViews(), ["c1", "c2"])
        # where it ended beside where it began: Hod walked 100 units on c2 and stood on c1 (b-npc-puppet's end claim)
        self.assertTrue(ev.evaluate("c2.watched_id(0x13483).endX - c2.watched_id(0x13483).x == 100"))
        self.assertTrue(ev.evaluate("abs(c1.watched_id(0x13483).endX - c2.watched_id(0x13483).endX) == 100"))
        self.assertTrue(ev.evaluate("c2.watched_id(0x13483).endY == -47100 and c2.watched_id(0x13483).endZ == -120"))
        # the rotation signed: a quarter turn one way, seven the other; turns is its absolute value over 360
        self.assertTrue(ev.evaluate("c2.watched_id(0x13483).turned == -90 and c2.watched_id(0x13483).turns == 0.25"))
        self.assertTrue(ev.evaluate("c2.watched_id(0xff00090d).turned == 2520"))
        self.assertTrue(ev.evaluate("abs(c2.watched_id(0xff00090d).turned - c2.watched_id(0x13483).turned) / 360 > 7"))
        # c1's record carries no signed rotation and 0x13489's no stop position (a driver before them): no pass
        for bad in ("abs(c2.watched_id(0x13483).turned - c1.watched_id(0x13483).turned) / 360 < 0.25",
                    "c2.watched_id(0x13489).endX > 0"):
            with self.subTest(bad=bad), self.assertRaises(AssertionData):
                ev.evaluate(bad)

@needs_deps
class RefsNearTests(unittest.TestCase):
    def test_count_has_and_distance_read_the_last_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), RefsNearViews(), ["c1", "c2"])
        # a count-only type is the cell's count; a listed type the references within the radius
        self.assertTrue(ev.evaluate("c1.refs_near().count(50) == 1"))
        self.assertTrue(ev.evaluate("c1.refs_near().count(24) == 1"))
        self.assertTrue(ev.evaluate("c1.refs_near().count(51) == 1"))
        self.assertTrue(ev.evaluate("c2.refs_near().count(24) == 0"))
        # has: listed under its type (a disabled one counts), or found by the ids search
        self.assertTrue(ev.evaluate("c1.refs_near().has(0x3E8F0)"))
        self.assertTrue(ev.evaluate("c1.refs_near().has(0x5FBC0)"))
        self.assertTrue(ev.evaluate("c1.refs_near().has(0x5FBBF)"))
        # distance: the listing's exact figure, else the search's bisected one
        self.assertTrue(ev.evaluate("abs(c1.refs_near().distance(0x3E8F0) - 55) < 0.01"))
        self.assertTrue(ev.evaluate("c1.refs_near().distance(0x5FBBF) < 300"))
        self.assertEqual(ev.readings["c1.refs_near().count(50)"], 1)
        self.assertEqual(ev.readings["c1.refs_near().distance(392127)"], 52.5)

    def test_none_within_the_radius_is_false_and_no_distance(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), RefsNearViews(), ["c1", "c2"])
        # searched by id and not found; not searched and not among the listed types
        self.assertTrue(ev.evaluate("not c2.refs_near().has(0x5FBBF)"))
        self.assertTrue(ev.evaluate("c2.refs_near().has(0x3E8F0) == false"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().distance(0x5FBBF) < 1200")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().distance(0x3E8F0) < 1200")

    def test_unlisted_types_aborted_searches_and_reference_classes_are_data_errors(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), RefsNearViews(), ["c1", "c2"])
        # a type the step did not list
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.refs_near().count(43) == 0")
        # a search the step caught
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().has(0x3BE12)")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().distance(0x3BE12) < 1")
        # a reference class (65 PGRE) matches no base, SKSE filtering by the base
        # form's type: the step's note is the finding, never a 0 that reads as "gone"
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.refs_near().count(65) >= 1")
        # a client with no refs-near step
        other = Evaluator(RichServer(), ProjectileViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            other.evaluate("c1.refs_near().count(50) == 1")
        # the shapes the language refuses
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c1.refs_near(1).count(50) == 1")
        with self.assertRaises(AssertionSyntax):
            ev.evaluate('c1.refs_near().count("50") == 1')
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c1.refs_near().has(1.5)")
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c1.refs_near().inCell(50) == 1")


class SkillViews(NearViews):
    """c1's last skills step: One-Handed at 41 with some experience, Archery
    made legendary once, level 12."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {"skills": {"OneHanded": {"base": 41.0, "xp": 3.5, "legendary": 0},
                                       "Marksman": {"base": 15.0, "xp": 0.0, "legendary": 1}},
                            "level": 12}}

    def skills(self, observer):
        return self.read.get(observer)


@needs_deps
class SkillTests(unittest.TestCase):
    def test_skill_and_level_read_the_last_skills_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), SkillViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.skill("OneHanded").base >= 41'))
        self.assertTrue(ev.evaluate('c1.skill("OneHanded").xp > 3'))
        self.assertTrue(ev.evaluate('c1.skill("Marksman").legendary == 1'))
        self.assertTrue(ev.evaluate("c1.level() == 12"))

    def test_an_unread_skill_or_client_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), SkillViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate('c1.skill("Smithing").base == 15')
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.level() == 1")


class WeatherViews(NearViews):
    """c1's last weather step: SkyrimCloudy settled; c2's: blending into
    SkyrimClear from SkyrimCloudy, a third of the way."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {"current": 0x12F89, "outgoing": 0, "transition": 1.0},
                     "c2": {"current": 0x81A, "outgoing": 0x12F89, "transition": 0.34}}

    def weather(self, observer):
        return self.read.get(observer)


@needs_deps
class WeatherTests(unittest.TestCase):
    def test_weather_reads_the_last_weather_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), WeatherViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.weather().current == 0x12f89"))
        self.assertTrue(ev.evaluate("c1.weather().outgoing == 0"))
        self.assertTrue(ev.evaluate("c1.weather().transition == 1"))
        self.assertTrue(ev.evaluate("c2.weather().current != c1.weather().current"))
        self.assertTrue(ev.evaluate("c2.weather().outgoing == c1.weather().current"))
        self.assertTrue(ev.evaluate("c2.weather().transition < 1"))

    def test_a_seat_without_a_weather_step_is_a_data_error(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), WeatherViews(), ["c1", "c2", "c3"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c3.weather().current == 0")
        with self.assertRaises(AssertionSyntax):
            ev.evaluate("c1.weather().wind == 0")


class NodeScaleViews(NearViews):
    """c1 read its own head at 1.6; c2 read every actor near it: a stale
    disabled reference and a live figure where the server has c1 (290, 0, 0),
    and a guard far off."""

    def __init__(self):
        super().__init__()
        self.read = {
            "c1": {"self": {"node": "NPC Head [Head]", "actor": 20, "engine": 1.6, "raceMenu": 1.6, "morph": 0.7}},
            "c2": {"other": {"node": "NPC Head [Head]", "actor": 0xFF0008DC, "engine": 1.0, "raceMenu": 1.0, "all": [
                {"actor": 0xFF0008DC, "engine": 1.0, "raceMenu": 1.0, "enabled": False, "loaded": True, "pos": [290.0, 0.0, 0.0]},
                {"actor": 0xFF0008DD, "engine": 1.6, "raceMenu": 1.6, "morph": 0.7, "enabled": True, "loaded": True, "pos": [292.0, 1.0, 0.0]},
                {"actor": 0xFF000009, "engine": 1.0, "raceMenu": 1.0, "enabled": True, "loaded": True, "pos": [5000.0, 0.0, 0.0]},
            ]}},
        }

    def node_scales(self, observer):
        return self.read.get(observer)


class AvViews(NearViews):
    """c1 read its own Health at base 250 (200 of it left); c2 read every
    actor near it: a stale disabled reference at the million where the
    server has c1 (290, 0, 0), the live figure beside it at 250, and a guard
    far off (thuum docs/verbs/figure-values.md)."""

    def __init__(self):
        super().__init__()
        av = lambda base, current: {"base": base, "current": current, "maximum": base, "percentage": current / base}
        self.read = {
            "c1": {"self": {"of": 20, "values": {"health": av(250.0, 200.0), "magicka": av(120.0, 120.0)}}},
            "c2": {"other": {"of": 0xFF0008DC, "values": {"health": av(1000000.0, 1000000.0)}, "all": [
                {"id": 0xFF0008DC, "enabled": False, "loaded": True, "pos": [290.0, 0.0, 0.0], "values": {"health": av(1000000.0, 1000000.0)}},
                {"id": 0xFF0008DD, "enabled": True, "loaded": True, "pos": [292.0, 1.0, 0.0], "values": {"health": av(250.0, 200.0), "magicka": av(120.0, 120.0)}},
                {"id": 0xFF000009, "enabled": True, "loaded": True, "pos": [5000.0, 0.0, 0.0], "values": {"health": av(100.0, 100.0)}},
            ]}},
        }

    def av_reads(self, observer):
        return self.read.get(observer)


class PresetViews(NearViews):
    """c2 saved its own look twice, the same, and c1 its own, another."""

    def __init__(self):
        super().__init__()
        self.read = {"c2": {"own-before": {"saved": "own-before", "bytes": 2932, "sha256": "54d2", "look": "1111"},
                            "own-after": {"saved": "own-after", "bytes": 2932, "sha256": "9f93", "look": "1111"}},
                     "c1": {"c1-own": {"saved": "c1-own", "bytes": 3165, "sha256": "ad0a", "look": "2222"}}}

    def presets(self, observer):
        return self.read.get(observer)


@needs_deps
class PresetTests(unittest.TestCase):
    def test_saves_compare_by_hash_and_size(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), PresetViews(), ["c1", "c2"])
        # the same look though the bytes differ (head parts in another order)
        self.assertTrue(ev.evaluate('c2.preset("own-after").look == c2.preset("own-before").look'))
        self.assertTrue(ev.evaluate('c2.preset("own-after").sha256 != c2.preset("own-before").sha256'))
        self.assertTrue(ev.evaluate('c2.preset("own-before").sha256 != c1.preset("c1-own").sha256'))
        self.assertTrue(ev.evaluate('c1.preset("c1-own").bytes > 3000'))

    def test_an_unsaved_name_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), PresetViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate('c2.preset("own-end").bytes > 0')


class ConsoleViews(NearViews):
    """c1's last console step: the line it typed and what the console printed."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {"typed": "player.additem f 7", "keys": 18,
                            "lines": ["player.additem f 7", "additem done"]}}

    def consoles(self, observer):
        return self.read.get(observer)


@needs_deps
class ConsoleTests(unittest.TestCase):
    def test_printed_reads_the_last_console_step(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), ConsoleViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.printed("additem done")'))
        self.assertFalse(ev.evaluate('c1.printed("Not enough permissions")'))
        self.assertTrue(ev.evaluate('not c1.printed("refused")'))

    def test_printed_reads_the_history_a_match_brought_back(self):
        # b-cell-host 20261021-193557: the release trace sat in the matched history and printed() read false
        from labapi.assertions import Evaluator
        views = ConsoleViews()
        views.read["c1"] = {"typed": "getglobalvalue gamehour", "keys": 23, "lines": ["GetGlobalValue >> 16.79"],
                            "history": ["[Script] Trace in HostService: released cell 9810 (epoch 1) "]}
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.printed("released cell 9810")'))
        self.assertTrue(ev.evaluate('c1.printed("GetGlobalValue")'))
        self.assertFalse(ev.evaluate('c1.printed("released cell 9811")'))

    def test_a_client_without_a_console_step_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), ConsoleViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate('c2.printed("additem done")')


class ShoutServer(RichServer):
    """c1's shouts record: Fire Breath with its first word known and
    unlocked, 12.5 s of its recovery left."""

    def __init__(self):
        super().__init__()
        self.actors["c1"]["shouts"] = {"shouts": [0x3F9EA], "wordsKnown": [0x20E17], "wordsUnlocked": [0x20E17],
                                       "recoverySecondsLeft": 12.5}


@needs_deps
class ShoutRecordTests(unittest.TestCase):
    def test_the_record_and_the_recovery_read(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(ShoutServer(), NearViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('server.actor(c1).shouts == "0x3f9ea"'))
        self.assertTrue(ev.evaluate('server.actor(c1).wordsUnlocked == "0x20e17"'))
        self.assertTrue(ev.evaluate('server.actor(c1).shoutRecovery > 12'))

    def test_a_server_without_the_record_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), NearViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate('server.actor(c1).shoutRecovery > 0')


class PartsServer(RichServer):
    """c1's appearance with three head parts, in the order a client sent them."""

    def __init__(self):
        super().__init__()
        self.actors["c1"]["headParts"] = [0x51631, 0x51505, 0x5162F]


class PartsViews(NearViews):
    """c1's last head-parts step on its own player; c2 read only c1's figure."""

    def __init__(self):
        super().__init__()
        self.read = {"c1": {"actor": 0x14, "parts": [{"id": 0x5162F, "type": 1, "name": "x"},
                                                    {"id": 0x51631, "type": 0, "name": "y"},
                                                    {"id": 0x51505, "type": 3, "name": "z"}]}}

    def head_parts(self, observer):
        return self.read.get(observer)


@needs_deps
class HeadPartTests(unittest.TestCase):
    def test_the_server_and_the_game_agree_as_sets(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(PartsServer(), PartsViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('server.actor(c1).headParts == c1.head_parts()'))
        self.assertTrue(ev.evaluate('server.actor(c1).headParts == "0x51505,0x5162f,0x51631"'))

    def test_missing_parts_are_data_errors(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(PartsServer(), PartsViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate('c2.head_parts() == ""')


class NodeRotationViews(NearViews):
    """Each seat's node-rotation reads of one puzzle pillar (0xaa8cb), as the driver answers with the platform's
    deferred read: c1 at a 120-degree turn about z, c2 at the same pose written as another Euler triple, and c2's
    {label: before} read at rest; c2's first step on another pillar answered no poll yet."""

    def __init__(self):
        super().__init__()
        import math
        turn = 2 * math.pi / 3

        def read(world, has=True, available=True, answered=True):
            return {"formId": 0xAA8CB, "deferred": {"available": available, "read": answered,
                                                     "nodes": [{"node": "Pillar01", "has": has, "world": world, "local": world}]}}

        # the same rotation: x and y turned half a circle each, z by turn - pi (SetEulerAnglesXYZ's identity at pi, pi, pi)
        self.reads = {
            "c1": {(0xAA8CB, ""): read([0.0, 0.0, turn])},
            "c2": {(0xAA8CB, ""): read([math.pi, math.pi, turn + math.pi]), (0xAA8CB, "before"): read([0.0, 0.0, 0.0]),
                   (0xAA8CC, ""): read([0.0, 0.0, 0.0], answered=False)},
        }

    def node_rotations(self, observer):
        return self.reads.get(observer)


@needs_deps
class NodeRotationTests(unittest.TestCase):
    def test_two_seats_poses_compare_by_the_angle_between_them(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), NodeRotationViews(), ["c1", "c2"])
        # one pose in two Euler triples is no angle apart; the turn is 120 degrees from c2's own read before it
        self.assertTrue(ev.evaluate('c1.node_rotation(0xaa8cb, "Pillar01").angle_to(c2.node_rotation(0xaa8cb, "Pillar01")) < 0.01'))
        self.assertTrue(ev.evaluate('abs(c2.node_rotation(0xaa8cb, "Pillar01").angle_to(c2.node_rotation(0xaa8cb, "Pillar01", "before")) - 120) < 0.01'))
        self.assertTrue(ev.evaluate('c1.node_rotation(0xaa8cb, "Pillar01").has == true'))

    def test_a_missing_or_unanswered_read_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        views = NodeRotationViews()
        views.reads["c1"][(0xAA8CB, "late")] = {"formId": 0xAA8CB, "deferred": {"available": False}}
        views.reads["c1"][(0xAA8CB, "gone")] = {"formId": 0xAA8CB, "deferred": {"available": True, "read": True,
                                                                               "nodes": [{"node": "Pillar01", "has": False, "world": [0, 0, 0]}]}}
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        for expr in ('c2.node_rotation(0xaa8cc, "Pillar01").has',               # the first step's answer is no poll
                     'c1.node_rotation(0xaa8cb, "Pillar01", "late").has',       # a platform without pollNodeRotation
                     'c1.node_rotation(0xaa8cb, "Pillar02").has',               # a node the step never polled
                     'c1.node_rotation(0x123, "Pillar01").has',                 # no step for that reference
                     'c1.node_rotation(0xaa8cb, "Pillar01", "gone").angle_to(c1.node_rotation(0xaa8cb, "Pillar01")) < 1',
                     'c1.node_rotation(0xaa8cb, "Pillar01", "gone").local_angle_to(c1.node_rotation(0xaa8cb, "Pillar01")) < 1'):
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)
        self.assertTrue(ev.evaluate('c1.node_rotation(0xaa8cb, "Pillar01", "gone").has == false'))

    def test_a_local_turn_reads_through_a_stale_world_transform(self):
        # x-puzzle-guest-view v2 20261105-032634, both seats alike: Pillar01's local z went 0 to -2.1083 (a full face,
        # -120.8 degrees) while its world z read -1.5708 then 3.6791, as from a half turn (59.2 degrees)
        from labapi.assertions import Evaluator
        views = NodeRotationViews()

        def row(world, local):
            return {"formId": 0xAA8CB, "deferred": {"available": True, "read": True,
                                                     "nodes": [{"node": "Pillar01", "has": True, "world": world, "local": local}]}}

        for c in ("c1", "c2"):
            views.reads[c][(0xAA8CB, "before")] = row([0.0, 0.0, -1.5708], [0.0, 0.0, 0.0])
            views.reads[c][(0xAA8CB, "afterA")] = row([0.0, 0.0, 3.6791], [0.0, 0.0, -2.1083])
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate('abs(c2.node_rotation(0xaa8cb, "Pillar01", "afterA").local_angle_to(c2.node_rotation(0xaa8cb, "Pillar01", "before")) - 120.8) < 0.1'))
        self.assertTrue(ev.evaluate('abs(c2.node_rotation(0xaa8cb, "Pillar01", "afterA").angle_to(c2.node_rotation(0xaa8cb, "Pillar01", "before")) - 59.2) < 0.1'))
        self.assertTrue(ev.evaluate('c1.node_rotation(0xaa8cb, "Pillar01", "afterA").local_angle_to(c2.node_rotation(0xaa8cb, "Pillar01", "afterA")) < 0.01'))

    def test_its_call_shapes_are_checked(self):
        from labapi.assertions import AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), NodeRotationViews(), ["c1", "c2"])
        for expr in ('c1.node_rotation(0xaa8cb).has', 'c1.node_rotation("Pillar01", 0xaa8cb).has',
                     'c1.node_rotation(0xaa8cb, "Pillar01").angle_to(5) < 1',
                     'c1.node_rotation(0xaa8cb, "Pillar01").local_angle_to("before") < 1',
                     'c1.node_rotation(0xaa8cb, "Pillar01").world == 0'):
            with self.assertRaises(AssertionSyntax, msg=expr):
                ev.evaluate(expr)


class ScriptStateViews(NearViews):
    """Each seat's script-state reads of Bleak Falls Temple's puzzle (ADR-068 rung 3, the record's read), in the answer's
    shape (docs/research/rung3-script-record-2026-11-06.md 1(a)): c1 the host with the first pillar 0xaa8cb at rest on its
    second face and the lever 0xaa8c3 with its two scripts; c2 the guest read 0.5 s into a turn, busy; the engine's string
    pool has kept another spelling of the state."""

    def __init__(self):
        super().__init__()
        lever = {"kind": 0, "mid": 65535, "form": 0xAA8C3, "type": "defaultPillarPuzzleLever"}
        self.answers = {
            "c1": {
                0xAA8CB: {"formId": 0xAA8CB, "quiescent": True, "fnv1a": 0x9DC5811C, "scripts": [{
                    "type": "defaultPuzzlePillarScript", "state": "Position02", "flags": 11,
                    "names": ["doOnce", "::initialState_var", "myLinkedRef", "::solveState_var", "pillarSolved"],
                    "vars": [{"k": 5, "b": True}, {"k": 3, "i": 1}, {"k": 1, "o": lever}, {"k": 3, "i": 3}, {"k": 5, "b": False}]}]},
                0xAA8C3: {"formId": 0xAA8C3, "quiescent": True, "fnv1a": 0x1234, "scripts": [
                    {"type": "defaultPillarPuzzleLever", "state": "Waiting", "flags": 11,
                     "names": ["::numPillarsSolved_var", "::pillarCount_var", "::puzzleSolved_var", "::refActOnFailure01_var", "::ratio_var", "::tag_var", "::list_var"],
                     "vars": [{"k": 3, "i": 1}, {"k": 3, "i": 3}, {"k": 5, "b": False}, {"k": 1}, {"k": 4, "f": 0.5}, {"k": 2, "s": "Trigger02"},
                              {"k": 11, "elem": "ObjectReference", "a": []}]},
                    {"type": "TrapLever", "state": "Inactive", "flags": 11, "names": ["a"], "vars": []}]},
            },
            "c2": {0xAA8CB: {"formId": 0xAA8CB, "quiescent": False, "busy": "stack 4711 state 3 in defaultPuzzlePillarScript.RotatePillarToState"}},
        }

    def script_state(self, observer, form_id):
        return self.answers.get(observer, {}).get(form_id)


@needs_deps
class ScriptStateTests(unittest.TestCase):
    def test_a_pillar_at_rest_reads_its_state_and_variables(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), ScriptStateViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).quiescent == true and c1.script_state(0xaa8cb).count == 1'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).state == "position02"'))        # lowercased, as Papyrus compares
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).variable("initialState") == 1'))  # a property by its own name
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).variable("::solveState_var") == 3'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).variable("doOnce") == true and c1.script_state(0xaa8cb).variable("pillarSolved") == false'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).variable("myLinkedRef") == 0xaa8c3'))  # an object as its form id
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8cb).fnv1a == 0x9dc5811c'))
        self.assertEqual(ev.readings[f"c1.script_state({0xAA8CB}).state"], "position02")

    def test_a_reference_with_two_scripts_names_the_one_it_reads(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), ScriptStateViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3).count == 2'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3, "defaultPillarPuzzleLever").variable("numPillarsSolved") == 1'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3).script("DEFAULTPILLARPUZZLELEVER").state == "waiting"'))  # case-blind
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3, "TrapLever").state == "inactive"'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3, "defaultPillarPuzzleLever").variable("refActOnFailure01") == 0'))  # a None object
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3, "defaultPillarPuzzleLever").variable("ratio") == 0.5'))
        self.assertTrue(ev.evaluate('c1.script_state(0xaa8c3, "defaultPillarPuzzleLever").variable("tag") == "trigger02"'))
        for expr in ('c1.script_state(0xaa8c3).state == "waiting"',                                       # two scripts, none named
                     'c1.script_state(0xaa8c3).variable("numPillarsSolved") == 1',
                     'c1.script_state(0xaa8c3, "defaultPuzzlePillarScript").state == "waiting"',          # a type it lacks
                     'c1.script_state(0xaa8c3).script("Nope").count == 2',
                     'c1.script_state(0xaa8c3, "defaultPillarPuzzleLever").variable("list") == 0',        # an array
                     'c1.script_state(0xaa8c3, "defaultPillarPuzzleLever").variable("pillarSolved") == 0',  # no such variable
                     'c1.script_state(0xaa8c3, "TrapLever").variable("a") == 0'):                         # names without vars
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)

    def test_a_busy_answer_names_its_stack_and_reads_no_script(self):
        # H-R2: a pillar 0.5 s into a turn answers quiescent false, its PlayAnimationAndWait's stack waiting on a latent
        # function (Stack.h:32's kWaitingOnLatentFunction, 3)
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), ScriptStateViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c2.script_state(0xaa8cb).quiescent == false and c2.script_state(0xaa8cb).busyState == 3'))
        self.assertTrue(ev.evaluate('c2.script_state(0xaa8cb).busy == "stack 4711 state 3 in defaultPuzzlePillarScript.RotatePillarToState"'))
        self.assertTrue(ev.evaluate('c2.script_state(0xaa8cb, "defaultPuzzlePillarScript").quiescent == false'))  # a type is unread while busy
        for expr in ('c2.script_state(0xaa8cb).state == "busy"', 'c2.script_state(0xaa8cb).variable("doOnce") == true',
                     'c2.script_state(0xaa8cb).fnv1a == 0', 'c2.script_state(0xaa8cb).count == 0',
                     'c1.script_state(0xaa8cb).busyState == 3'):                                          # a quiescent answer names none
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)

    def test_no_read_or_a_malformed_answer_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        views = ScriptStateViews()
        views.answers["c1"][0xAA8CC] = {"formId": 0xAA8CC, "scripts": []}                        # no quiescent at all
        views.answers["c1"][0xAA8CD] = {"formId": 0xAA8CD, "quiescent": True, "fnv1a": 1, "scripts": [
            {"type": "defaultPuzzlePillarScript", "state": "position01", "names": ["doOnce"], "vars": [{"k": 5, "b": 1}]}]}
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        for expr in ('c1.script_state(0x39fdd).quiescent == true',                                  # never read on c1
                     'c2.script_state(0xaa8c3).quiescent == true',
                     'c1.script_state(0xaa8cc).quiescent == true',
                     'c1.script_state(0xaa8cd).variable("doOnce") == true'):                         # a bool that is no bool
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), NearViews(), ["c1", "c2"]).evaluate('c1.script_state(0xaa8cb).quiescent == true')  # no reads kept

    def test_a_last_read_that_failed_is_a_data_error_never_an_older_answer(self):
        # the board keeps an error answer in the place of the seat's last good one (b-script-state-restart's review,
        # note 1), and the accessor raises on it, the error's text in the message
        from labapi.assertions import AssertionData, Evaluator
        views = ScriptStateViews()
        views.answers["c1"][0xAA8CB] = {"error": "SerializeScriptState refused aa8cb (answer \"\"; the seat's log says why)"}
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        for expr in ('c1.script_state(0xaa8cb).quiescent == true', 'c1.script_state(0xaa8cb, "defaultPuzzlePillarScript").state == "position02"'):
            with self.assertRaisesRegex(AssertionData, "answered an error: SerializeScriptState refused aa8cb", msg=expr):
                ev.evaluate(expr)

    def test_the_servers_script_record_of_a_reference(self):
        # ADR-068 rung 3: labState ref's scriptStateFnv, scriptStateAt and scriptStateSeq (the server's scriptState
        # property), 0 without a record; a lab gamemode without the fields is missing data, never a pass
        from labapi.assertions import AssertionData, Evaluator
        srv = RichServer()
        refs = {0xAA8CB: {"found": True, "actorId": 0xAA8CB, "x": 5656.0, "y": -896.0, "z": -768.0, "cell": "371de:Skyrim.esm",
                          "scriptStateFnv": 0x9DC5811C, "scriptStateAt": 1762430000123, "scriptStateSeq": 2},
                0xAA8CC: {"found": True, "actorId": 0xAA8CC, "x": 5656.0, "y": -640.0, "z": -768.0, "cell": "371de:Skyrim.esm",
                          "scriptStateFnv": 0, "scriptStateAt": 0, "scriptStateSeq": 0},
                0xAA8CD: {"found": True, "actorId": 0xAA8CD, "x": 5656.0, "y": -384.0, "z": -768.0, "cell": "371de:Skyrim.esm"}}
        srv.ref = lambda actor_id: refs.get(actor_id, {"found": False})
        ev = Evaluator(srv, ScriptStateViews(), ["c1", "c2"], snapshots={"atBefore": 1762430000000})
        for expr in ("server.ref(0xaa8cb).scriptStateFnv == 0x9dc5811c", "server.ref(0xaa8cb).scriptStateSeq == 2",
                     'server.ref(0xaa8cb).scriptStateAt > snapshot("atBefore")', "server.ref(0xaa8cc).scriptStateAt == 0",
                     "server.ref(0xaa8cb).scriptStateFnv == c1.script_state(0xaa8cb).fnv1a"):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaises(AssertionData):
            ev.evaluate("server.ref(0xaa8cd).scriptStateFnv == 0")   # a gamemode without the fields

    def test_its_call_shapes_are_checked(self):
        from labapi.assertions import AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), ScriptStateViews(), ["c1", "c2"])
        for expr in ('c1.script_state().quiescent', 'c1.script_state("0xaa8cb").quiescent', 'c1.script_state(0xaa8cb, 3).quiescent',
                     'c1.script_state(0xaa8cb, "a", "b").quiescent', 'c1.script_state(0xaa8cb).variable(3) == 1',
                     'c1.script_state(0xaa8cb).script() == 1', 'c1.script_state(0xaa8cb).vars == 1', 'c1.script_state(0xaa8cb).names == 1'):
            with self.assertRaises(AssertionSyntax, msg=expr):
                ev.evaluate(expr)


class SlotServer(RichServer):
    """A ServerFacade that resolves FormDescs through a fixed load order, as the runner's tables do (guests.py base_id):
    Skyrim.esm in slot 0, Apocalypse in slot 0x1a (the essentials layer's, as the console's comment in runner.py names it)."""

    SLOTS = {"skyrim.esm": 0x00, "apocalypse - magic of skyrim.esp": 0x1A}

    def base_id(self, spec):
        s = spec.strip()
        if ":" in s and not s.lower().startswith("skyrim.esm:"):
            local, _, plugin = s.partition(":")
            if plugin.lower() not in self.SLOTS:
                raise KeyError(f"{plugin} is not in the running load order")
            return (self.SLOTS[plugin.lower()] << 24) | int(local, 16)
        return super().base_id(s)


class RungFourViews(NearViews):
    """Each seat's alias and factions reads (ADR-068 rung 4's grammar), in lab-driver's answer shapes: c1 read an alias that
    holds Arvel's placement and one that holds nothing; c2's read of a quest it lacks answered an error; c1's standing read of
    Arvel names two factions, one it is in and one it is not, and one form that is no faction in its game. Alias ids, the
    Apocalypse forms and 0x12345 are the fixture's own, not the game files'."""

    def __init__(self):
        super().__init__()
        self.aliases = {
            "c1": {(0x39645, 0): {"quest": 0x39645, "alias": 0, "refr": 0x39655, "name": "Arvel"},
                   (0x39645, 1): {"quest": 0x39645, "alias": 1, "refr": 0, "name": "Empty"},
                   (0x1A0A0001, 2): {"quest": 0x1A0A0001, "alias": 2, "refr": 0x14, "name": "Caster"}},
            "c2": {(0x39645, 0): {"error": "no quest 39645 in this game"}},
        }
        self.standing = {
            "c1": {0x39655: {"formId": 0x39655, "ranks": {str(0xDB1): 0, str(0x5C84E): -1, str(0x12345): None},
                             "members": {str(0xDB1): True, str(0x5C84E): False, str(0x12345): None}, "crime": 0},
                   0x14: {"formId": 0x14, "ranks": {str(0x1A0B0002): 2}, "members": {str(0x1A0B0002): True}, "crime": 0xDB1}},
            "c2": {0x39655: {"error": "no actor 39655 in this game"}},
        }

    def alias(self, observer, quest, alias):
        return self.aliases.get(observer, {}).get((quest, alias))

    def factions(self, observer, form_id):
        return self.standing.get(observer, {}).get(form_id)


@needs_deps
class RungFourTests(unittest.TestCase):
    """ADR-068 rung 4's grammar (docs/research/rung4-state-rows-2026-11-07.md 1(e)): the two seat reads, the ref's state on the
    server, the world's globals with their streamer, the alias fills."""

    def test_a_seats_alias_reads_its_reference_and_name(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(SlotServer(), RungFourViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.alias(0x39645, 0).refr == 0x39655"))
        self.assertTrue(ev.evaluate('c1.alias(0x39645, 0).name == "Arvel" and c1.alias(0x39645, 1).refr == 0'))
        self.assertTrue(ev.evaluate('c1.alias("0a0001:Apocalypse - Magic of Skyrim.esp", 2).refr == 0x14'))  # a FormDesc quest
        self.assertEqual(ev.readings[f"c1.alias({0x39645}, 0).refr"], 0x39655)
        for expr in ('c2.alias(0x39645, 0).refr == 0',          # its last read answered an error
                     'c1.alias(0x39645, 7).refr == 0',          # never read on c1
                     'c2.alias(0x39645, 1).refr == 0',
                     'c1.alias("0a0001:NoSuch.esp", 2).refr == 0'):
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)
        with self.assertRaisesRegex(AssertionData, "answered an error: no quest 39645"):
            ev.evaluate('c2.alias(0x39645, 0).refr == 0')

    def test_a_seats_standing_reads_ranks_membership_and_the_crime_faction(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(SlotServer(), RungFourViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c1.factions(0x39655).rank(0xdb1) == 0 and c1.factions(0x39655).member(0xdb1) == true"))
        self.assertTrue(ev.evaluate("c1.factions(0x39655).member(0x5c84e) == false and c1.factions(0x39655).rank(0x5c84e) == -1"))
        self.assertTrue(ev.evaluate('c1.factions(0x39655).rank("000db1:Skyrim.esm") == 0'))
        self.assertTrue(ev.evaluate('c1.factions(0x14).rank("0b0002:Apocalypse - Magic of Skyrim.esp") == 2'))
        self.assertTrue(ev.evaluate("c1.factions(0x39655).crime == 0 and c1.factions(0x14).crime == 0xdb1"))
        for expr in ("c1.factions(0x39655).rank(0x99999) == 0",     # a faction the step did not name
                     "c1.factions(0x39655).rank(0x12345) == 0",     # no faction of that id in c1's game
                     "c1.factions(0x39655).member(0x12345) == false",
                     "c2.factions(0x39655).crime == 0",             # its last read answered an error
                     "c1.factions(0x13485).crime == 0"):            # never read
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)

    def test_the_servers_ref_state_of_a_reference(self):
        # labState ref's isDisabled, isDeleted and refStateSeq; a gamemode without the fields is missing data, never a pass
        from labapi.assertions import AssertionData, Evaluator
        srv = SlotServer()
        refs = {0x3AC73: {"found": True, "actorId": 0x3AC73, "x": 1211.0, "y": 1084.0, "z": -212.0, "cell": "371de:Skyrim.esm",
                          "isDisabled": True, "isDeleted": False, "refStateSeq": 3},
                0x17037: {"found": True, "actorId": 0x17037, "x": 6867.0, "y": -5874.0, "z": -1687.0, "cell": "371de:Skyrim.esm",
                          "isDisabled": False, "isDeleted": False, "refStateSeq": 0},
                0x1FC43: {"found": True, "actorId": 0x1FC43, "x": 3918.0, "y": -3314.0, "z": -1779.0, "cell": "371de:Skyrim.esm"}}
        srv.ref = lambda actor_id: refs.get(actor_id, {"found": False})
        ev = Evaluator(srv, RungFourViews(), ["c1", "c2"])
        for expr in ("server.ref(0x3ac73).isDisabled == true", "server.ref(0x3ac73).refStateSeq > 0",
                     "server.ref(0x3ac73).isDeleted == false", "server.ref(0x17037).isDisabled == false",
                     "server.ref(0x17037).refStateSeq == 0"):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        for expr in ("server.ref(0x1fc43).isDisabled == false", "server.ref(0x1fc43).refStateSeq == 0",
                     "server.ref(0x1fc43).isDeleted == false"):
            with self.assertRaises(AssertionData, msg=expr):
                ev.evaluate(expr)

    def test_the_worlds_globals_and_their_streamer(self):
        # labState worldGlobals: the streamer as the run's client by its actor id, the epoch, and values keyed by FormDesc
        # text or form id, either resolved through the run's load order
        from labapi.assertions import AssertionData, Evaluator
        srv = SlotServer()
        srv.actors["c1"]["actorId"] = 0xFF000000
        srv.actors["c2"]["actorId"] = 0xFF000001
        record = {"found": True, "streamer": 0xFF000000, "epoch": 2,
                  "entries": [{"global": "0a6ec2:Apocalypse - Magic of Skyrim.esp", "value": 7.0},
                              {"global": 0x1A0A6EC3, "value": 9.5},
                              {"global": "000999:NoSuch.esp", "value": 1.0}]}
        srv.world_globals = lambda: record
        ev = Evaluator(srv, RungFourViews(), ["c1", "c2"])
        for expr in ('server.world_globals().streamer == "c1"', "server.world_globals().epoch == 2",
                     "server.world_globals().actorId == 0xff000000",
                     'server.world_globals().value("0a6ec2:Apocalypse - Magic of Skyrim.esp") == 7',
                     "server.world_globals().value(0x1a0a6ec2) == 7",
                     'server.world_globals().value("0a6ec3:Apocalypse - Magic of Skyrim.esp") == 9.5'):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaisesRegex(AssertionData, "no world value of 0a6ec4.*1 entries did not resolve"):
            ev.evaluate('server.world_globals().value("0a6ec4:Apocalypse - Magic of Skyrim.esp") == 7')
        record["streamer"] = 0
        self.assertTrue(ev.evaluate('server.world_globals().streamer == ""'))
        record["streamer"] = 0xFF000005                                         # a player outside the run
        self.assertTrue(ev.evaluate('server.world_globals().streamer == "" and server.world_globals().actorId == 0xff000005'))
        srv.world_globals = lambda: None                                        # a server without the kind
        with self.assertRaises(AssertionData):
            ev.evaluate('server.world_globals().streamer == "c1"')

    def test_the_servers_alias_fills(self):
        # labState aliasFills: a ref half's row and a created half's row; quests and forms by form id or FormDesc text
        from labapi.assertions import AssertionData, Evaluator
        srv = SlotServer()
        fills = {"found": True, "fills": [
            {"quest": 0x39645, "alias": 0, "refr": 0x39655, "created": 0, "container": 0, "added": False},
            {"quest": "039645:Skyrim.esm", "alias": 1, "refr": 0, "created": "039647:Skyrim.esm", "container": 0x39655, "added": True},
            {"quest": "0a0001:Apocalypse - Magic of Skyrim.esp", "alias": 2, "refr": 0x14, "created": 0, "container": 0, "added": False}]}
        srv.alias_fills = lambda: fills
        ev = Evaluator(srv, RungFourViews(), ["c1", "c2"])
        for expr in ("server.alias_fill(0x39645, 0).refr == 0x39655", "server.alias_fill(0x39645, 0).added == false",
                     "server.alias_fill(0x39645, 1).created == 0x39647", "server.alias_fill(0x39645, 1).container == 0x39655",
                     "server.alias_fill(0x39645, 1).added == true and server.alias_fill(0x39645, 1).refr == 0",
                     'server.alias_fill("039645:Skyrim.esm", 0).refr == c1.alias(0x39645, 0).refr',
                     'server.alias_fill("0a0001:Apocalypse - Magic of Skyrim.esp", 2).refr == 0x14'):
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))
        with self.assertRaisesRegex(AssertionData, "records no fill of 0x39645 alias 9"):
            ev.evaluate("server.alias_fill(0x39645, 9).refr == 0")
        srv.alias_fills = lambda: None
        with self.assertRaises(AssertionData):
            ev.evaluate("server.alias_fill(0x39645, 0).refr == 0")

    def test_its_call_shapes_are_checked(self):
        from labapi.assertions import AssertionSyntax, Evaluator
        srv = SlotServer()
        # each read answers, so a shape is judged on a view that exists (the Evaluator reads the view before its attribute)
        srv.world_globals = lambda: {"found": True, "streamer": 0, "epoch": 1, "entries": []}
        srv.alias_fills = lambda: {"found": True, "fills": [{"quest": 0x39645, "alias": 0, "refr": 0x39655, "added": False}]}
        srv.ref = lambda actor_id: {"found": True, "actorId": actor_id, "x": 0.0, "y": 0.0, "z": 0.0, "cell": "", "isDisabled": True}
        ev = Evaluator(srv, RungFourViews(), ["c1", "c2"])
        for expr in ("c1.alias(0x39645).refr == 0", "c1.alias(0x39645, 0, 1).refr == 0", 'c1.alias(0x39645, "0").refr == 0',
                     "c1.alias(true, 0).refr == 0", "c1.alias(0x39645, 0).quest == 0", "c1.factions().crime == 0",
                     'c1.factions("0x39655").crime == 0', "c1.factions(0x39655).rank() == 0", "c1.factions(0x39655).ranks == 0",
                     "server.world_globals(c1).epoch == 0", "server.world_globals().entries == 0", "server.world_globals().value() == 0",
                     "server.alias_fill(0x39645).refr == 0", "server.alias_fill(0x39645, 0).quest == 0",
                     "server.ref(0x3ac73).disabled == true"):
            with self.assertRaises(AssertionSyntax, msg=expr):
                ev.evaluate(expr)


@needs_deps
class NodeScaleTests(unittest.TestCase):
    def test_own_and_figure_scales_read_the_last_node_scale_steps(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), NodeScaleViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("abs(c1.node_scale() - 1.6) < 0.01"))
        # the disabled reference sits nearer the server's position; the live figure is judged
        self.assertTrue(ev.evaluate("abs(c2.node_scale_of(c1) - 1.6) < 0.01"))
        # a body morph reads the same way
        self.assertTrue(ev.evaluate("abs(c1.morph() - 0.7) < 0.01"))
        self.assertTrue(ev.evaluate("abs(c2.morph_of(c1) - 0.7) < 0.01"))

    def test_no_live_figure_or_no_step_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        views = NodeScaleViews()
        views.read["c2"]["other"]["all"] = [n for n in views.read["c2"]["other"]["all"] if not n["enabled"]]
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.node_scale_of(c1) > 1")
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.node_scale() > 1")
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.node_scale_of(c2) > 1")


@needs_deps
class AvReadTests(unittest.TestCase):
    def test_a_figure_s_values_are_read_where_the_server_has_the_other_client(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), AvViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("abs(c1.av().health - 250) < 0.01"))
        self.assertTrue(ev.evaluate("abs(c1.av().healthCurrent - 200) < 0.01"))
        self.assertTrue(ev.evaluate("abs(c1.av().healthPercentage - 0.8) < 0.01"))
        # the disabled reference at the million sits nearer; the live figure is judged
        self.assertTrue(ev.evaluate("abs(c2.av_of(c1).health - c1.av().health) < 1"))
        self.assertTrue(ev.evaluate("c2.av_of(c1).health < 100000"))
        self.assertTrue(ev.evaluate("abs(c2.av_of(c1).magicka - 120) < 0.01"))

    def test_a_missing_step_or_name_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), AvViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.av().stamina > 1")  # not read
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.av().health > 1")  # c2 read no self step
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.av_of(c2).health > 1")  # c1 read no other step


@needs_deps
class WatchTests(unittest.TestCase):
    def test_watched_matches_the_server_position_and_reports_the_farthest_point(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).maxDisplacement > 4000"))
        self.assertTrue(ev.evaluate("c2.watched(c1).samples > 0"))
        self.assertTrue(ev.evaluate("abs(c2.watched(c1).x - server.actor(c1).x) < 50"))
        still = Evaluator(RichServer(), WatchViews(c1_max=3.0), ["c1", "c2"])
        self.assertTrue(still.evaluate("c2.watched(c1).maxDisplacement < 500"))

    def test_watched_id_finds_an_actor_by_form_id_without_the_server(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        # the guard, named by its form id: no server position is needed
        self.assertTrue(ev.evaluate("c2.watched_id(4278190089).maxDisplacement < 1"))
        self.assertTrue(ev.evaluate("abs(c2.watched_id(4278190089).x - 5000) < 1"))
        self.assertTrue(ev.evaluate("c2.watched_id(4278190081).maxDisplacement > 4000"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.watched_id(4278190090).samples > 0")
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.watched_id(4278190089).samples > 0")

    def test_watched_times_the_figure_s_magicka_drain(self):
        """c1's figure streamed in c2's game from 900 ms to 4600 ms, then
        its magicka came back to a million."""
        from labapi.assertions import Evaluator
        series = [[0, 1000000.0], [900, 999999.9]] + [[900 + 50 * i, 999999.9 - 0.3 * i] for i in range(1, 75)] + [[5000, 1000000.0]]
        ev = Evaluator(RichServer(), WatchViews(c1_magicka=series), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).drainMs == 3700"))
        self.assertTrue(ev.evaluate("c2.watched(c1).drainEndMs == 4600"))
        never = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        self.assertTrue(never.evaluate("c2.watched(c1).drainMs == 0"))
        self.assertTrue(never.evaluate("c2.watched(c1).drainEndMs == -1"))

    def test_watched_reads_a_figure_s_stagger_events_and_bools(self):
        """thuum docs/verbs/stagger.md: c2's game blanked one staggerStart on
        c1's figure (its own engine's) and took one (relayed), and the
        figure's IsStaggering went true; c2's own side saw recoilStart."""
        from labapi.assertions import AssertionData, Evaluator
        views = WatchViews()
        views.watches["c2"]["actors"][0]["events"] = [[400, "staggerStart", 0], [1300, "staggerStart", 1], [1310, "recoilLargeStart", 1]]
        views.watches["c2"]["actors"][0]["bools"] = {"IsStaggering": [[0, False], [1320, True], [2600, False]], "IsRecoiling": [[0, False]]}
        views.watches["c2"]["self"] = {"events": [[200, "attackStart"], [700, "recoilStart"]], "bools": {"IsStaggering": [[0, False]]}}
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).took('staggerStart') == 1"))
        self.assertTrue(ev.evaluate("c2.watched(c1).sent('staggerStart') == 2"))
        self.assertTrue(ev.evaluate("c2.watched(c1).ever('IsStaggering')"))
        self.assertTrue(ev.evaluate("not c2.watched(c1).ever('IsRecoiling')"))
        self.assertTrue(ev.evaluate("c2.watched_self().saw('recoilStart') == 1"))
        self.assertTrue(ev.evaluate("c2.watched_self().saw('staggerStart') == 0"))
        self.assertTrue(ev.evaluate("not c2.watched_self().ever('IsStaggering')"))
        with self.assertRaises(AssertionData):
            ev.evaluate("c2.watched(c1).ever('bNoStagger')")
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.watched_self().saw('staggerStart') == 0")
        # a driver before bc5d76a reports neither: nothing taken, no bools
        old = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        self.assertTrue(old.evaluate("c2.watched(c1).took('staggerStart') == 0"))
        with self.assertRaises(AssertionData):
            old.evaluate("c2.watched(c1).ever('IsStaggering')")

    def test_watched_finds_an_actor_the_server_moved_where_it_ended(self):
        """thuum docs/verbs/push.md: a throw carries the server's record of
        the thrown player about 1100 units from where the watch began, and
        its figure on the other screen ended there too (x-push-south
        20261014-152858); an actor that neither began nor ended there is
        not it."""
        from labapi.assertions import AssertionData, Evaluator
        views = WatchViews()
        views.watches["c2"]["actors"][0]["first"] = [296.0 - 1100.0, 1.0, 0.0]
        views.watches["c2"]["actors"][0]["events"] = [[2622, "Ragdoll", 1], [7622, "GetUpBegin", 1]]
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).took('Ragdoll') == 1"))
        views.watches["c2"]["actors"][0]["last"] = [296.0 - 1100.0, 1.0, 0.0]
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), views, ["c1", "c2"]).evaluate("c2.watched(c1).took('Ragdoll') == 1")

    def test_watched_reports_the_largest_step_and_when(self):
        """thuum docs/verbs/push.md: thrown in the watcher's game, a figure's
        largest step comes with the throw (x-push-flight 20261014-210908: 70
        units at 2851 ms); following its player, after the get-up (x-push-south
        20261014-152858: 94 at 8952)."""
        from labapi.assertions import Evaluator
        views = WatchViews()
        views.watches["c2"]["actors"][0]["maxStep"] = 70.1
        views.watches["c2"]["actors"][0]["maxStepMs"] = 2851
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).maxStepMs < 5000"))
        self.assertTrue(ev.evaluate("c2.watched(c1).maxStep < 150"))
        old = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        self.assertTrue(old.evaluate("c2.watched(c1).maxStepMs == -1"))

    def test_watched_reads_how_far_a_figure_got_by_a_moment(self):
        """thuum docs/verbs/push.md: thrown in the watcher's game, the figure
        has flown by 5 s; one that only follows its player has not moved by
        then, and moves once its player is up."""
        from labapi.assertions import AssertionData, Evaluator
        views = WatchViews()
        views.watches["c2"]["actors"][0]["track"] = [[0, 296.0, 1.0, 0.0], [2500, 296.0, -400.0, 0.0], [3000, 296.0, -900.0, -40.0], [9000, 296.0, -1100.0, -40.0]]
        ev = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).movedBy(5000) > 800"))
        views.watches["c2"]["actors"][0]["track"] = [[0, 296.0, 1.0, 0.0], [2500, 296.0, 1.0, 0.0], [9000, 296.0, -1100.0, -40.0]]
        snapped = Evaluator(RichServer(), views, ["c1", "c2"])
        self.assertTrue(snapped.evaluate("c2.watched(c1).movedBy(5000) < 1"))
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), WatchViews(), ["c1", "c2"]).evaluate("c2.watched(c1).movedBy(5000) > 1")

    def test_a_watch_is_needed_and_is_not_a_dump(self):
        from labapi.assertions import AssertionData, Evaluator, clients_needing_views
        ev = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.watched(c2).maxDisplacement < 1")
        self.assertEqual(clients_needing_views("c2.watched(c1).maxDisplacement < 500", ["c1", "c2"]), set())


class LaunchViews(WatchViews):
    """c2 watched c1's figure launch the breath five times and shoot two arrows;
    c1's own watch holds the same five breaths and its two arrows' flights."""

    BREATH, CONE, ARROW = 0x3F9EB, 0x647BF, 0x1397D

    def __init__(self, figure_flights=None, own_flights=None):
        super().__init__()
        breaths = [[t, self.CONE, 0, self.BREATH, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0] for t in (1500, 3700, 5900, 8000, 12100)]
        arrows = [[20000, 0x3BE11, self.ARROW, 0, 0.0, 0.0, 0.0, 0.1, 3.14, 1.0], [24000, 0x3BE11, self.ARROW, 0, 0.0, 0.0, 0.0, 0.0, 6.2, 0.35]]
        self.watches["c2"]["actors"][0]["launches"] = breaths + arrows
        self.watches["c2"]["actors"][0]["flights"] = figure_flights if figure_flights is not None else [
            [20100, self.ARROW, 3.0, 4.0, 0.0, 0.12, 3.15, 1.0], [24200, self.ARROW, 10.0, 0.0, 0.0, 0.0, 0.05, 0.35]]
        self.watches["c1"] = {"actors": [], "self": {
            "events": [], "bools": {},
            "launches": [[t - 40, self.CONE, 0, self.BREATH, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0] for t in (1500, 3700, 5900, 8000, 12100)],
            "flights": own_flights if own_flights is not None else [
                [20000, self.ARROW, 0.0, 0.0, 0.0, 0.10, 3.14, 1.0], [24000, self.ARROW, 10.0, 0.0, 0.0, 0.0, 6.20, 0.35]]}}


@needs_deps
class LaunchTests(unittest.TestCase):
    def test_launched_counts_a_spell_projectile_or_ammo_given_as_a_number_or_a_string(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), LaunchViews(), ["c1", "c2"])
        for expr in ['c2.watched(c1).launched("0x3f9eb") == 5', "c2.watched(c1).launched(0x3f9eb) == 5",
                     'c2.watched(c1).launched("0x647bf") == 5', 'c2.watched(c1).launched("0x1397d") == 2',
                     'c2.watched(c1).launched("0x12fcd") == 0', 'c1.watched_self().launched("0x3f9eb") >= 5']:
            with self.subTest(expr=expr):
                self.assertTrue(ev.evaluate(expr))

    def test_launched_refuses_what_is_not_a_form_id(self):
        from labapi.assertions import AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), LaunchViews(), ["c1", "c2"])
        for expr in ['c2.watched(c1).launched("breath") == 0', "c2.watched(c1).launched(true) == 0", "c2.watched(c1).launched() == 0"]:
            with self.subTest(expr=expr), self.assertRaises(AssertionSyntax):
                ev.evaluate(expr)

    def test_a_watch_without_launches_counts_none(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate('c2.watched(c1).launched("0x3f9eb") == 0'))

    def test_flights_match_pairs_each_own_flight_and_returns_the_largest_gap(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), LaunchViews(), ["c1", "c2"])
        # positions 5 and 0 units apart; angles 0.02 rad and, across the circle, 0.133 rad (7.6 degrees)
        self.assertTrue(ev.evaluate('abs(c2.watched(c1).flights_match(c1.watched_self(), "position") - 5) < 0.001'))
        self.assertTrue(ev.evaluate('c2.watched(c1).flights_match(c1.watched_self(), "angle") > 7.5'))
        self.assertTrue(ev.evaluate('c2.watched(c1).flights_match(c1.watched_self(), "angle") < 7.7'))

    def test_a_shooter_s_flight_without_a_pair_fails(self):
        from labapi.assertions import AssertionData, Evaluator
        late = LaunchViews(figure_flights=[[20700, LaunchViews.ARROW, 0.0, 0.0, 0.0, 0.1, 3.14, 1.0],
                                           [24200, LaunchViews.ARROW, 10.0, 0.0, 0.0, 0.0, 0.05, 0.35]])
        other_ammo = LaunchViews(figure_flights=[[20100, 0x139C0, 0.0, 0.0, 0.0, 0.1, 3.14, 1.0],
                                                 [24200, LaunchViews.ARROW, 10.0, 0.0, 0.0, 0.0, 0.05, 0.35]])
        none_shot = LaunchViews(own_flights=[])
        for views in (late, other_ammo, none_shot):
            with self.subTest(views=views), self.assertRaises(AssertionData):
                Evaluator(RichServer(), views, ["c1", "c2"]).evaluate('c2.watched(c1).flights_match(c1.watched_self(), "position") < 100')

    def test_flights_match_refuses_a_bad_measure_or_argument_and_degrees(self):
        from labapi.assertions import AssertionData, AssertionSyntax, Evaluator
        ev = Evaluator(RichServer(), LaunchViews(), ["c1", "c2"])
        for expr in ['c2.watched(c1).flights_match(c1.watched_self(), "speed") < 1',
                     'c2.watched(c1).flights_match("c1", "angle") < 1',
                     "c2.watched(c1).flights_match(c1.watched_self()) < 1"]:
            with self.subTest(expr=expr), self.assertRaises(AssertionSyntax):
                ev.evaluate(expr)
        degrees = LaunchViews(own_flights=[[20000, LaunchViews.ARROW, 0.0, 0.0, 0.0, 10.0, 180.0, 1.0]])
        with self.assertRaises(AssertionData):
            Evaluator(RichServer(), degrees, ["c1", "c2"]).evaluate('c2.watched(c1).flights_match(c1.watched_self(), "angle") < 1')


@needs_deps
class DropTests(unittest.TestCase):
    def views(self, series):
        v = WatchViews()
        v.watches["c2"]["actors"][0]["bools"] = {"av:Invisibility": series}
        v.watches["c2"]["self"] = {"events": [], "bools": {"IsCastingLeft": [[0, False], [400, True], [900, False], [1500, True], [2100, False]]}}
        return v

    def test_drops_counts_true_to_false_changes(self):
        from labapi.assertions import Evaluator
        recast_bug = Evaluator(RichServer(), self.views([[0, False], [500, True], [6000, False], [6050, True], [12000, True]]), ["c1", "c2"])
        self.assertTrue(recast_bug.evaluate('c2.watched(c1).ever("av:Invisibility") == 1'))
        self.assertTrue(recast_bug.evaluate('c2.watched(c1).drops("av:Invisibility") == 1'))
        fixed = Evaluator(RichServer(), self.views([[0, False], [500, True], [6000, True], [12000, True]]), ["c1", "c2"])
        self.assertTrue(fixed.evaluate('c2.watched(c1).drops("av:Invisibility") == 0'))
        self.assertTrue(fixed.evaluate("c2.watched_self().drops('IsCastingLeft') == 2"))

    def test_rises_counts_increases_in_a_watched_actor_value_series(self):
        from labapi.assertions import AssertionData, Evaluator
        v = WatchViews()
        # the dent: the figure's bar dips below the server's step and climbs back once
        v.watches["c2"]["actors"][0]["health"] = [[0, 100.0], [400, 80.0], [450, 90.0], [3400, 70.0], [6400, 60.0]]
        v.watches["c2"]["self"] = {"events": [], "bools": {}, "health": [[0, 100.0], [500, 75.0], [3500, 50.0]]}
        v.watches["c2"]["actors"][0].pop("stamina", None)
        ev = Evaluator(RichServer(), v, ["c1", "c2"])
        self.assertTrue(ev.evaluate('c2.watched(c1).rises("health") == 1'))
        self.assertTrue(ev.evaluate("c2.watched_self().rises('Health') == 0"))
        for expr in ('c2.watched(c1).rises("speed") == 0', 'c2.watched(c1).rises("stamina") == 0'):
            with self.subTest(expr=expr), self.assertRaises(AssertionData):
                ev.evaluate(expr)  # not an actor value the watch samples; a series the driver did not send

    def test_rises_with_a_threshold_counts_only_rises_of_that_size(self):
        from labapi.assertions import AssertionSyntax, Evaluator
        v = WatchViews()
        # b-figure-values 20261021-003901's shape: three hits as declines, the figure's own regeneration between
        # the server's reports as rises of hundredths of a point; then one climb-back of a hit's size (the dent)
        v.watches["c2"]["actors"][0]["health"] = [[0, 100.0], [100, 98.3], [150, 98.32], [200, 97.7], [250, 97.748],
                                                   [300, 92.0], [350, 97.5]]
        v.watches["c2"]["self"] = {"events": [], "bools": {}, "health": [[0, 100.0], [500, 75.0], [600, 75.04]]}
        ev = Evaluator(RichServer(), v, ["c1", "c2"])
        self.assertTrue(ev.evaluate('c2.watched(c1).rises("health") == 3'))
        self.assertTrue(ev.evaluate('c2.watched(c1).rises("health", 1) == 1'))
        self.assertTrue(ev.evaluate('c2.watched(c1).rises("health", 0.5) == 1'))
        self.assertTrue(ev.evaluate('c2.watched(c1).rises("health", 0) == 3'))
        self.assertTrue(ev.evaluate("c2.watched_self().rises('health', 1) == 0"))
        self.assertTrue(ev.evaluate("c2.watched_self().rises('health') == 1"))
        for expr in ('c2.watched(c1).rises("health", True) == 0', 'c2.watched(c1).rises("health", "1") == 0',
                     'c2.watched(c1).rises("health", 1, 2) == 0', 'c2.watched(c1).rises(1) == 0',
                     'c2.watched(c1).rises() == 0'):
            with self.subTest(expr=expr), self.assertRaises(AssertionSyntax):
                ev.evaluate(expr)

    def test_drops_of_an_unsampled_bool_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(RichServer(), self.views([[0, True]]), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate('c2.watched(c1).drops("av:Ethereal") == 0')


class SpellServer(RichServer):
    """labState spell answers in the gamemode's shape (lab/gamemode/gamemode.js state.spell)."""

    def __init__(self):
        super().__init__()
        H, DET = 24, 0x5          # Health; Hostile | Detrimental
        mg = lambda flags, arch, av, cond=0, second=-1, weight=0.0: {
            "editorId": "m", "flags": flags, "archetype": arch, "primaryAV": av,
            "secondAVWeight": weight, "secondaryAV": second, "conditions": cond}
        self.spells = {
            # Firebolt under a layer: its damage at 20, a perk rider with a HasPerk CTDA, a
            # non-Health stagger, a beneficial heal, a Dual whose secondary is Health at 0.5,
            # a damage-over-time effect of 4 per second for 3 s
            0x12FD0: {"found": True, "effects": [
                {"mgef": 1, "magnitude": 20.0, "area": 0, "duration": 0, "conditions": 0},
                {"mgef": 2, "magnitude": 10.0, "area": 0, "duration": 0, "conditions": 1},
                {"mgef": 3, "magnitude": 99.0, "area": 0, "duration": 0, "conditions": 0},
                {"mgef": 4, "magnitude": 50.0, "area": 0, "duration": 0, "conditions": 0},
                {"mgef": 5, "magnitude": 8.0, "area": 0, "duration": 0, "conditions": 0},
                {"mgef": 6, "magnitude": 4.0, "area": 0, "duration": 3, "conditions": 0},
            ], "mgefs": {"1": mg(DET, 0, H), "2": mg(DET, 0, H), "3": mg(DET, 0, 25), "4": mg(0x0, 0, H),
                         "5": mg(DET, 5, 26, second=H, weight=0.5), "6": mg(DET, 0, H)}},
        }

    def spell(self, form_id):
        return self.spells.get(form_id, {"found": False})

    def base_id(self, spec):
        return 0x12FD0 if spec == "12fd0:Skyrim.esm" else super().base_id(spec)


@needs_deps
class SpellTests(unittest.TestCase):
    def test_a_spells_health_damage_follows_the_servers_rule(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(SpellServer(), NearViews(), ["c1", "c2"])
        # 20 (damage) + 8 x 0.5 (the Dual's Health share) at once; the rider is conditional; 4 x 3 over time
        self.assertTrue(ev.evaluate("server.spell(0x12FD0).magnitude == 24"))
        self.assertTrue(ev.evaluate("server.spell(0x12FD0).overTime == 12"))
        self.assertTrue(ev.evaluate("server.spell(0x12FD0).conditional == 1"))
        self.assertTrue(ev.evaluate("server.spell(0x12FD0).effects == 6"))
        self.assertTrue(ev.evaluate('server.spell("12fd0:Skyrim.esm").magnitude == 24'))
        self.assertTrue(ev.evaluate("server.actor(c1).healthPercentage < 1 - server.spell(0x12FD0).magnitude / 100 + 0.77"))

    def test_a_spell_the_server_does_not_load_is_a_data_error(self):
        from labapi.assertions import AssertionData, Evaluator
        ev = Evaluator(SpellServer(), NearViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("server.spell(0x99).magnitude == 0")
