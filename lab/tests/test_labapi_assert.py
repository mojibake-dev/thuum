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
