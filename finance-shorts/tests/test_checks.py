import array
import copy
import json
import unittest
from pathlib import Path

import cairo

from src.checks import check_brief, check_script, numbers
from src.pipeline import ass_time, build_ass
from src.visuals import RENDERERS, W, H, compound_value, draw_frame, events_for

ROOT = Path(__file__).resolve().parent.parent
BRIEF = json.loads((ROOT / "briefs" / "compound-interest.json").read_text(encoding="utf-8-sig"))
BRIEF["reviewed"] = True  # the sample ships unreviewed on purpose
SCRIPT = json.loads((ROOT / "examples" / "compound-interest.script.json").read_text(encoding="utf-8-sig"))


def scene(kind: str) -> dict:
    return next(s for s in SCRIPT["scenes"] if s["visual"]["type"] == kind)


class Checks(unittest.TestCase):
    def test_sample_passes(self):
        self.assertEqual(check_brief(BRIEF), [])
        self.assertEqual(check_script(SCRIPT, BRIEF), [])

    def test_unreviewed_brief_blocked(self):
        b = copy.deepcopy(BRIEF)
        b["reviewed"] = False
        self.assertTrue(any("reviewed" in e for e in check_brief(b)))

    def test_needs_two_trusted_sources(self):
        b = copy.deepcopy(BRIEF)
        b["sources"] = [BRIEF["sources"][0], {"name": "blog", "url": "https://money-blog.example.com/x"}]
        b["facts"] = [dict(f, source=0) for f in BRIEF["facts"]]
        self.assertTrue(any("2 distinct" in e for e in check_brief(b)))

    def test_invented_number_in_narration_blocked(self):
        s = copy.deepcopy(SCRIPT)
        s["scenes"][4]["narration"] = s["scenes"][4]["narration"].replace("$1,050", "$1,075")
        self.assertTrue(any("1075" in e for e in check_script(s, BRIEF)))

    def test_invented_number_on_screen_blocked(self):
        s = copy.deepcopy(SCRIPT)
        s["scenes"][7]["visual"]["lines"][1] = "÷ 11%"
        self.assertTrue(any("11" in e for e in check_script(s, BRIEF)))

    def test_number_without_fact_id_blocked(self):
        s = copy.deepcopy(SCRIPT)
        s["scenes"][4]["fact_ids"] = []
        self.assertTrue(any("no fact_ids" in e for e in check_script(s, BRIEF)))

    def test_banned_phrases_blocked(self):
        for bad in ("This is guaranteed to work.", "Buy $TSLA now.", "You should invest in crypto.",
                    "Become a millionaire.", "Money grows while you sleep."):
            s = copy.deepcopy(SCRIPT)
            s["scenes"][0]["narration"] += " " + bad
            self.assertTrue(check_script(s, BRIEF), bad)

    def test_counter_numbers_must_be_in_brief(self):
        s = copy.deepcopy(SCRIPT)
        s["scenes"][6]["visual"]["rate"] = 0.12
        self.assertTrue(any("12" in e for e in check_script(s, BRIEF)))

    def test_structure_rules(self):
        s = copy.deepcopy(SCRIPT)
        s["scenes"][0]["visual"] = {"type": "lines", "lines": ["a"]}
        self.assertTrue(any("must use a 'hook'" in e for e in check_script(s, BRIEF)))
        s = copy.deepcopy(SCRIPT)
        s["scenes"] = s["scenes"][:4]
        self.assertTrue(any("scenes; want at least" in e for e in check_script(s, BRIEF)))
        s = copy.deepcopy(SCRIPT)
        s["scenes"][7]["visual"]["lines"] = ["72", "÷ 9%", "= 8", "years"]
        self.assertTrue(any("at most 3 lines" in e for e in check_script(s, BRIEF)))

    def test_number_normalising(self):
        self.assertEqual(numbers("$1,102.50 and 5.0% and 7,612."), {"1102.5", "5", "7612"})


class Visuals(unittest.TestCase):
    def frame(self, spec: dict, t: float, dur: float) -> bytes:
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        draw_frame(cairo.Context(surf), spec, t, dur)
        return bytes(surf.get_data())

    def test_every_scene_type_animates(self):
        # the "bland" complaint, as a test: a scene must look different early vs late
        for s in SCRIPT["scenes"]:
            spec = s["visual"]
            self.assertIn(spec["type"], RENDERERS)
            self.assertNotEqual(self.frame(spec, 0.4, 5.0), self.frame(spec, 2.4, 5.0), spec["type"])

    def test_events_stay_inside_scene(self):
        for s in SCRIPT["scenes"]:
            ev = events_for(s["visual"], 4.0)
            self.assertTrue(ev and all(0 <= t < 4.0 for t, _, _ in ev))

    def test_compound_math_matches_sources(self):
        self.assertAlmostEqual(compound_value(1000, 0.07, 30), 7612.26, places=2)
        self.assertAlmostEqual(compound_value(1000, 0.05, 2), 1102.5)

    def test_music_is_original_and_audible(self):
        import tempfile
        import wave
        from src.music import STYLES, write_music
        with tempfile.TemporaryDirectory() as d:
            for style in STYLES:
                p = Path(d) / f"{style}.wav"
                write_music(6.0, p, style)
                with wave.open(str(p)) as w:
                    self.assertGreater(w.getnframes(), 6 * 44100)
                    samples = array.array("h", w.readframes(w.getnframes()))
                self.assertGreater(max(abs(x) for x in samples), 10000, style)  # audible, not silence
            with self.assertRaises(ValueError):
                write_music(1.0, Path(d) / "x.wav", "polka")

    def test_ass_times_and_captions(self):
        self.assertEqual(ass_time(61.5), "0:01:01.50")
        ass = build_ass(SCRIPT["scenes"], [4.0] * len(SCRIPT["scenes"]))
        self.assertIn("Educational only. Not financial advice.", ass)
        self.assertIn("&H0066D1FF&", ass)  # active word highlight


if __name__ == "__main__":
    unittest.main()
