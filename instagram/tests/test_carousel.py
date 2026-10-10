import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
import carousel


def sample():
    return {
        'title': 'Useful work prompts', 'verified_on': '2026-10-10',
        'sources': [{'name': 'Synthetic reference', 'url': 'https://example.org/reference'}],
        'caption': 'Try a clear instruction. Comment PROMPTS.',
        'hashtags': ['#one', '#two', '#three', '#four', '#five'], 'disclosure': '',
        'slides': [
            {'role': 'hook', 'headline': 'Less busywork', 'kicker': 'START HERE'},
            *[{'role': 'point', 'headline': 'Write a clear request', 'kicker': f'PROMPT {i}',
               'body': ['Supply context and check the result.'], 'chips': ['For: work'],
               'prompt': 'Draft a reply using these notes. Ask about missing information.'}
              for i in range(1, 9)],
            {'role': 'cta', 'headline': 'Save your starting point',
             'body': ['Comment PROMPTS for the list.']}
        ]
    }


class CarouselTests(unittest.TestCase):
    def setUp(self):
        self.brand = json.loads((carousel.ROOT / 'brand.json').read_text(encoding='utf-8'))

    def run_post(self, post, root, out):
        path = root / 'synthetic.json'
        path.write_text(json.dumps(post), encoding='utf-8')
        errors = io.StringIO()
        with contextlib.redirect_stderr(errors), contextlib.redirect_stdout(io.StringIO()):
            code = carousel.main(['synthetic', '--post', str(path), '--out', str(out)])
        return code, errors.getvalue()

    def test_valid_post_renders_and_is_not_flat(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            out = root / 'render'
            self.assertEqual(self.run_post(sample(), root, out), (0, ''))
            self.assertEqual(len(list(out.glob('slide-*.png'))), 10)
            for path in out.glob('*.png'):
                with Image.open(path) as image:
                    self.assertEqual(image.size, (1080, 1350))
                    self.assertGreater(len(image.getcolors(image.width * image.height)), 50)
            self.assertIn('#one #two #three #four #five', (out / 'caption.txt').read_text())
            sentinel = out / 'caption.txt'
            sentinel.write_text('preserve me')
            self.assertEqual(self.run_post(sample(), root, out)[0], 1)
            self.assertEqual(sentinel.read_text(), 'preserve me')

    def test_validation_failures_write_nothing(self):
        cases = []
        def add(label, mutate):
            post = copy.deepcopy(sample())
            mutate(post)
            cases.append((label, post))
        add('slide count', lambda p: p['slides'].pop())
        cases[-1][1]['slides'].pop()
        cases[-1][1]['slides'].pop()
        for index, role in ((0, 'point'), (2, 'cta'), (9, 'hook')):
            add('role', lambda p, i=index, r=role: p['slides'][i].update(role=r))
        add('headline words', lambda p: p['slides'][1].update(headline='word ' * 10))
        add('body count', lambda p: p['slides'][1].update(body=['short'] * 4))
        add('body words', lambda p: p['slides'][1].update(body=['word ' * 19]))
        add('chips', lambda p: p['slides'][1].update(chips=['chip'] * 4))
        add('prompt', lambda p: p['slides'][1].update(prompt='word ' * 46))
        add('hashtags', lambda p: p.update(hashtags=['#one']))
        add('hashtag prefix', lambda p: p['hashtags'].__setitem__(0, 'one'))
        add('sources absent', lambda p: p.update(sources=[]))
        add('http source', lambda p: p['sources'][0].update(url='http://example.org'))
        add('invalid date', lambda p: p.update(verified_on='2026-02-30'))
        add('non ISO date', lambda p: p.update(verified_on='20261010'))
        for claim in ('Guaranteed', 'guarantee', 'get rich', 'passive income', 'make $50',
                      'earn $20', '10x your income', 'overnight', 'secret that',
                      "they don't want you to know", 'They don’t want you to know'):
            add('claim ' + claim, lambda p, c=claim: p.update(caption=c, allow_money=True))
        add('nested banned text', lambda p: p['slides'][1].update(prompt='GET RICH'))
        add('money', lambda p: p.update(title='Costs $20'))
        add('money flag type', lambda p: p.update(allow_money='true'))
        add('affiliate caption', lambda p: p.update(caption='Affiliate reference'))
        add('affiliate slide', lambda p: p['slides'][1].update(chips=['Affiliate']))
        add('buy caption', lambda p: p.update(caption='Link in bio to buy'))
        add('sponsored', lambda p: p.update(sponsored=True))
        add('headline fit', lambda p: p['slides'][1].update(headline='W' * 100))
        add('four line fit', lambda p: p['slides'][1].update(headline='WWWWW ' * 9))
        add('body fit', lambda p: p['slides'][1].update(body=['W' * 100]))
        add('chips fit', lambda p: p['slides'][1].update(chips=['W' * 100]))
        add('kicker fit', lambda p: p['slides'][1].update(kicker='W' * 100))
        add('overflow', lambda p: p['slides'][1].update(body=['word ' * 18] * 3, prompt='word ' * 45))
        add('malformed slide', lambda p: p['slides'].__setitem__(1, None))
        add('malformed body', lambda p: p['slides'][1].update(body=42))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for label, post in cases:
                with self.subTest(label=label):
                    out = root / 'never-created'
                    code, errors = self.run_post(post, root, out)
                    self.assertEqual(code, 1, label)
                    self.assertTrue(errors)
                    self.assertFalse(out.exists())

    def test_disclosure_and_money_permission(self):
        post = sample()
        post.update(caption='Affiliate reference costs $20.', allow_money=True,
                    disclosure='Ad: affiliate reference.')
        self.assertEqual(carousel.validate(post, self.brand), [])
        parts, _, _ = carousel.layout(post['slides'][-1], post['disclosure'])
        self.assertIn('disclosure', [part[0] for part in parts])
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            out = root / 'disclosed'
            self.assertEqual(self.run_post(post, root, out)[0], 0)
            self.assertIn(post['disclosure'], (out / 'caption.txt').read_text())

    def test_eight_and_nine_slide_posts(self):
        for count in (8, 9):
            post = sample()
            post['slides'] = post['slides'][:count - 1] + [post['slides'][-1]]
            self.assertEqual(carousel.validate(post, self.brand), [])

    def test_malformed_json_and_slug(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / 'broken.json'
            path.write_text('{')
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(carousel.main(['bad', '--post', str(path), '--out', str(root / 'out')]), 1)
                self.assertEqual(carousel.main(['../bad']), 1)
            self.assertFalse((root / 'out').exists())

    def test_brand_validation_and_render_failure_are_preflight(self):
        bad_brand = copy.deepcopy(self.brand)
        bad_brand['colors']['accent'] = 'invalid'
        self.assertTrue(carousel.validate(sample(), bad_brand))
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(carousel, 'render', side_effect=ValueError('synthetic rendering failure')):
                self.assertEqual(self.run_post(sample(), root, root / 'out')[0], 1)
            self.assertFalse((root / 'out').exists())

    def test_no_cross_project_imports(self):
        source = Path(carousel.__file__).read_text(encoding='utf-8')
        for forbidden in ('finance-shorts', 'finance_shorts', 'roblox-videos', 'roblox_videos', 'carousel-draft'):
            self.assertNotIn(forbidden, source)


if __name__ == '__main__':
    unittest.main()
