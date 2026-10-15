"""The parity diff (lab/labapi/labapi/parity.py, ADR-031) on synthetic
records in the lab-driver recorder's shape."""
import unittest

import _labapi  # noqa: F401  (puts lab/labapi on the path; parity needs no dependencies)
from labapi import parity


def record(**fields):
    base = {
        "formId": 0x14, "name": "test", "first": [0, 0, 0], "last": [0, 0, 0],
        "maxDisplacement": 0.0, "maxStep": 0.0, "maxStepMs": -1, "samples": 100,
        "health": [[0, 100.0]], "magicka": [[0, 100.0]], "stamina": [[0, 100.0]],
        "events": [], "vars": {}, "bools": {}, "casts": [], "hits": [], "taken": [], "effects": [],
    }
    base.update(fields)
    return base


# a figure walking before and after a hit: the walk is on both sides of the cut
WALK = [[100, "moveStart", 1], [900, "moveStop", 1], [1500, "moveStart", 1], [2500, "moveStop", 1]]


class ConsequencesTest(unittest.TestCase):
    def test_only_what_the_action_brought(self):
        r = record(events=WALK + [[1200, "staggerStart", 1]],
                   vars={"IsStaggering": [[0, 0], [1210, 1], [2000, 0]], "Speed": [[0, 0.0], [1500, 120.5]]},
                   health=[[0, 100.0], [1200, 61.5]])
        keys = set(parity.consequences(r, 1000))
        self.assertEqual(keys, {"events/staggerStart", "vars/IsStaggering=1", "values/health-fell"})

    def test_a_refused_event_is_its_own_key(self):
        r = record(events=[[1200, "MRh_SpellAimedConcentrationStart", 0], [1201, "MRh_SpellRelease_Event", 1]])
        keys = set(parity.consequences(r, 1000))
        self.assertIn("refused/MRh_SpellAimedConcentrationStart", keys)
        self.assertIn("events/MRh_SpellRelease_Event", keys)
        self.assertNotIn("events/MRh_SpellAimedConcentrationStart", keys)

    def test_effects_hits_and_physics(self):
        r = record(effects=[[1300, 0xFF000001, 0x7F82F]], taken=[[1250, 0xFF000001, 0x13F3A, 1]],
                   maxDisplacement=420.0, maxStep=40.0, maxStepMs=1400)
        keys = set(parity.consequences(r, 1000))
        self.assertEqual(keys, {"effects/7f82f", "taken/13f3a/power", "physics/moved"})

    def test_a_float_that_moves_past_its_baseline(self):
        r = record(vars={"CastBlend": [[0, 0.0], [500, 0.02], [1300, 0.75]]})
        self.assertEqual(set(parity.consequences(r, 1000)), {"vars/CastBlend~"})
        quiet = record(vars={"CastBlend": [[0, 0.0], [500, 0.02], [1300, 0.03]]})
        self.assertEqual(set(parity.consequences(quiet, 1000)), set())

    def test_a_series_first_sample_is_the_baseline_even_after_the_cut(self):
        # a cut at 0 (a reference's action less a longer lead) must not make
        # every variable's first value a consequence (p-spell-bolt 20261015-073742)
        r = record(vars={"iState": [[13, 0], [1200, 10]]}, bools={"IsCastingRight": [[14, False], [1300, True]]})
        keys = set(parity.consequences(r, 0))
        self.assertIn("vars/iState=10", keys)
        self.assertIn("bools/IsCastingRight=1", keys)
        self.assertNotIn("vars/iState=0", keys)
        self.assertNotIn("bools/IsCastingRight=0", keys)

    def test_a_stumble_is_not_a_throw(self):
        # a stagger's few steps stay under the move tolerance; a throw does not
        self.assertNotIn("physics/moved", parity.consequences(record(maxDisplacement=40.0), 1000))
        self.assertIn("physics/moved", parity.consequences(record(maxDisplacement=40.0), 1000, {"move": 20.0}))


class DiffTest(unittest.TestCase):
    def views(self, actor_own=None, target_figure=None, target_own=None, actor_figure=None, at=1000):
        return {
            "actor-own": (actor_own or record(), at),
            "target-figure": (target_figure or record(), at),
            "target-own": (target_own or record(), at),
            "actor-figure": (actor_figure or record(), at),
        }

    def test_identical_runs_have_no_findings(self):
        fig = record(events=WALK + [[1200, "staggerStart", 1]])
        self.assertEqual(parity.diff(self.views(target_figure=fig), self.views(target_figure=fig)), [])

    def test_the_figure_refuses_what_the_engine_plays(self):
        # the concentration pose (playtest fifteen): the reference NPC takes
        # the cast start, the figure is sent it and refuses it
        ref = record(events=[[1200, "MRh_SpellAimedConcentrationStart", 1]])
        run = record(events=[[1250, "MRh_SpellAimedConcentrationStart", 0]])
        found = {str(f) for f in parity.diff(self.views(actor_figure=run), self.views(actor_figure=ref))}
        self.assertEqual(found, {
            "actor-figure/events/MRh_SpellAimedConcentrationStart missing",
            "actor-figure/refused/MRh_SpellAimedConcentrationStart extra",
        })

    def test_a_throw_the_run_never_plays(self):
        # Unrelenting Force: the engine alone throws the target; the run staggers it in place
        ref = record(events=[[1100, "Ragdoll", 1]], maxDisplacement=380.0, health=[[0, 100.0], [1100, 50.0]])
        run = record(events=[[1100, "staggerStart", 1]], health=[[0, 100.0], [1300, 50.0]])
        found = {str(f) for f in parity.diff(self.views(target_own=run), self.views(target_own=ref))}
        self.assertEqual(found, {
            "target-own/events/Ragdoll missing",
            "target-own/physics/moved missing",
            "target-own/events/staggerStart extra",
        })

    def test_later_names_what_a_later_slice_takes(self):
        ref = record(events=[[1100, "Ragdoll", 1]], maxDisplacement=380.0)
        run = record()
        later = ["target-own/events/Ragdoll", "target-own/physics/*"]
        self.assertEqual(parity.diff(self.views(target_own=run), self.views(target_own=ref), later), [])

    def test_a_later_line_for_every_view(self):
        ref = record(events=[[1100, "Ragdoll", 1]])
        views = self.views(target_own=record(), target_figure=record())
        refs = self.views(target_own=ref, target_figure=ref)
        self.assertEqual(len(parity.diff(views, refs)), 2)
        self.assertEqual(parity.diff(views, refs, ["*/events/Ragdoll"]), [])

    def test_a_finding_says_what_each_side_showed(self):
        ref = record(events=[[1200, "MRh_SpellAimedConcentrationStart", 1]])
        run = record(events=[[1250, "MRh_SpellAimedConcentrationStart", 0]])
        found = parity.diff(self.views(actor_figure=run), self.views(actor_figure=ref))
        missing = [f for f in found if f.kind == "missing"][0]
        self.assertEqual(missing.reference, "taken at 1200 ms")
        self.assertEqual(missing.run, "sent, not taken")
        self.assertIn("reference: taken at 1200 ms; run: sent, not taken", missing.detail())

    def test_findings_sort_by_view_then_channel(self):
        ref = record(events=[[1100, "Ragdoll", 1]], maxDisplacement=380.0)
        found = parity.diff(self.views(target_own=record(), actor_own=record()),
                            self.views(target_own=ref, actor_own=ref))
        self.assertEqual([str(f) for f in found], [
            "actor-own/events/Ragdoll missing", "actor-own/physics/moved missing",
            "target-own/events/Ragdoll missing", "target-own/physics/moved missing",
        ])

    def test_the_reference_views(self):
        # a figure's oracle is the player's own record of the same role
        a_self, a_npc, b_self, b_npc = record(name="a"), record(name="a-npc"), record(name="b"), record(name="b-npc")
        views = parity.reference_views(a_self, a_npc, 1000, b_self, b_npc, 2000)
        self.assertEqual(views["actor-own"], (a_self, 1000))
        self.assertEqual(views["actor-figure"], (a_self, 1000))
        self.assertEqual(views["target-own"], (b_self, 2000))
        self.assertEqual(views["target-figure"], (b_self, 2000))
        self.assertEqual(set(parity.reference_views(a_self, a_npc, 1000, None, None, 0)), {"actor-own", "actor-figure"})
        npc = parity.reference_views(a_self, a_npc, 1000, b_self, b_npc, 2000, npc=True)
        self.assertEqual(npc["target-figure"], (a_npc, 1000))
        self.assertEqual(npc["actor-figure"], (b_npc, 2000))

    def test_a_bool_only_one_watch_named_is_not_compared(self):
        ref = record(bools={"IsAttacking": [[0, False], [1300, True]], "IsStaggering": [[0, False]]})
        run = record(bools={"IsStaggering": [[0, False]]})
        self.assertEqual(parity.diff(self.views(actor_own=run), self.views(actor_own=ref)), [])

    def test_each_record_is_cut_at_its_own_action(self):
        # the multiplayer action came 600 ms later in its watch than in the reference
        ref = record(events=[[1100, "staggerStart", 1]])
        run = record(events=[[1700, "staggerStart", 1]])
        views = self.views(target_figure=run, at=1600)
        self.assertEqual(parity.diff(views, self.views(target_figure=ref, at=1000)), [])

    def test_a_view_without_a_reference_is_not_compared(self):
        refs = {"actor-own": (record(), 1000)}
        run = self.views(target_own=record(events=[[1100, "Ragdoll", 1]]))
        self.assertEqual(parity.diff(run, refs), [])


class CountTest(unittest.TestCase):
    """ADR-033: a key both sides show, the run fewer times, is a finding."""

    def views(self, actor_figure, at=1000):
        return {"actor-figure": (actor_figure, at)}

    def casts(self, n, start=1100, gap=600):
        return [[start + i * gap, 0x12FD0] for i in range(n)]  # the recorder's casts rows: [ms, spell]

    def test_a_count_below_the_references_is_missing_n_of_m(self):
        # playtest nineteen: every other cast refused whole, the key set unchanged
        ref = record(casts=self.casts(5))
        run = record(casts=self.casts(3))
        found = parity.diff(self.views(run), self.views(ref))
        self.assertEqual([str(f) for f in found], ["actor-figure/casts/12fd0 missing 2 of 5"])
        self.assertEqual(found[0].kind, "missing")
        self.assertEqual(found[0].count, (3, 5))
        self.assertIn("(reference: 5 times; run: 3 times)", found[0].detail())

    def test_as_many_or_more_is_not_a_finding(self):
        ref = record(casts=self.casts(5))
        self.assertEqual(parity.diff(self.views(record(casts=self.casts(5))), self.views(ref)), [])
        self.assertEqual(parity.diff(self.views(record(casts=self.casts(7))), self.views(ref)), [])

    def test_each_counted_channel(self):
        def taken_events(n):
            return [[1100 + i * 500, "MRh_SpellAimedStart", 1] for i in range(n)]
        ref = record(events=taken_events(4), hits=[[1200 + i, 0xFF000002, 0x12FD0, 0, 0] for i in range(4)],
                     taken=[[1200 + i, 0xFF000002, 0x12FD0, 0] for i in range(4)],
                     effects=[[1300 + i, 0xFF000002, 0x7F82F] for i in range(4)])
        run = record(events=taken_events(2) + [[2100, "MRh_SpellAimedStart", 0]],
                     hits=[[1200, 0xFF000002, 0x12FD0, 0, 0]], taken=[[1200, 0xFF000002, 0x12FD0, 0]],
                     effects=[[1300 + i, 0xFF000002, 0x7F82F] for i in range(4)])
        found = {str(f) for f in parity.diff(self.views(run), self.views(ref))}
        self.assertEqual(found, {
            "actor-figure/events/MRh_SpellAimedStart missing 2 of 4",  # a refused one is not taken
            "actor-figure/hits/12fd0/plain missing 3 of 4",
            "actor-figure/taken/12fd0/plain missing 3 of 4",
        })

    def test_counts_start_at_the_cut(self):
        ref = record(casts=self.casts(3))
        run = record(casts=[[400, 0x12FD0]] + self.casts(2))  # one before the cut
        self.assertEqual([str(f) for f in parity.diff(self.views(run), self.views(ref))],
                         ["actor-figure/casts/12fd0 missing 1 of 3"])

    def test_the_later_list_covers_a_count_as_it_covers_a_key(self):
        ref = record(casts=self.casts(5))
        run = record(casts=self.casts(3))
        self.assertEqual(parity.diff(self.views(run), self.views(ref), ["*/casts/12fd0"]), [])
        self.assertEqual(parity.diff(self.views(run), self.views(ref), ["actor-figure/casts/*#count"]), [])

    def test_a_count_line_never_excuses_the_keys_absence(self):
        ref = record(casts=self.casts(5))
        found = parity.diff(self.views(record()), self.views(ref), ["actor-figure/casts/12fd0#count"])
        self.assertEqual([str(f) for f in found], ["actor-figure/casts/12fd0 missing"])


if __name__ == "__main__":
    unittest.main()
