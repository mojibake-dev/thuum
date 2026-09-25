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
        self.actors["c1"].update({"isDead": False, "healthPercentage": 0.5, "hasAppearance": True, "raceId": 79683, "sex": 0})
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

    def test_form_and_state_and_actor_fields(self):
        for expr in [
            'c1.state.equippedRight == form("Skyrim.esm:IronSword")',
            "abs(c1.state.health.percentage - 0.5) < 0.05" if False else "abs(c1.state.healthPercentage - 0.5) < 0.05",
            "c1.state.magickaPercentage == 1.0",
            "server.actor(c1).hasAppearance == true",
            "server.actor(c1).raceId == 79683",
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
