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
