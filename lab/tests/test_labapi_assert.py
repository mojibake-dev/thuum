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

    def __init__(self, c1_max=5000.0):
        super().__init__()
        self.watches = {
            "c2": {"actors": [
                {"formId": 0xFF000001, "name": "c1", "first": [296.0, 1.0, 0.0], "last": [296.0, 1.0, 0.0], "maxDisplacement": c1_max, "samples": 240},
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
            "c1": {"self": {"node": "NPC Head [Head]", "actor": 20, "engine": 1.6, "raceMenu": 1.6}},
            "c2": {"other": {"node": "NPC Head [Head]", "actor": 0xFF0008DC, "engine": 1.0, "raceMenu": 1.0, "all": [
                {"actor": 0xFF0008DC, "engine": 1.0, "raceMenu": 1.0, "enabled": False, "loaded": True, "pos": [290.0, 0.0, 0.0]},
                {"actor": 0xFF0008DD, "engine": 1.6, "raceMenu": 1.6, "enabled": True, "loaded": True, "pos": [292.0, 1.0, 0.0]},
                {"actor": 0xFF000009, "engine": 1.0, "raceMenu": 1.0, "enabled": True, "loaded": True, "pos": [5000.0, 0.0, 0.0]},
            ]}},
        }

    def node_scales(self, observer):
        return self.read.get(observer)


@needs_deps
class NodeScaleTests(unittest.TestCase):
    def test_own_and_figure_scales_read_the_last_node_scale_steps(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), NodeScaleViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("abs(c1.node_scale() - 1.6) < 0.01"))
        # the disabled reference sits nearer the server's position; the live figure is judged
        self.assertTrue(ev.evaluate("abs(c2.node_scale_of(c1) - 1.6) < 0.01"))

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
class WatchTests(unittest.TestCase):
    def test_watched_matches_the_server_position_and_reports_the_farthest_point(self):
        from labapi.assertions import Evaluator
        ev = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        self.assertTrue(ev.evaluate("c2.watched(c1).maxDisplacement > 4000"))
        self.assertTrue(ev.evaluate("c2.watched(c1).samples > 0"))
        self.assertTrue(ev.evaluate("abs(c2.watched(c1).x - server.actor(c1).x) < 50"))
        still = Evaluator(RichServer(), WatchViews(c1_max=3.0), ["c1", "c2"])
        self.assertTrue(still.evaluate("c2.watched(c1).maxDisplacement < 500"))

    def test_a_watch_is_needed_and_is_not_a_dump(self):
        from labapi.assertions import AssertionData, Evaluator, clients_needing_views
        ev = Evaluator(RichServer(), WatchViews(), ["c1", "c2"])
        with self.assertRaises(AssertionData):
            ev.evaluate("c1.watched(c2).maxDisplacement < 1")
        self.assertEqual(clients_needing_views("c2.watched(c1).maxDisplacement < 500", ["c1", "c2"]), set())
