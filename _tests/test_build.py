"""The build (_build/build.py) renders its templates correctly and gives every page its SEO tags.

Canonical, hreflang and sitemap.xml come from _build/pages.py. These checks make sure each
built page names itself as canonical, that a German page and its English counterpart point at
each other, and that the sitemap lists every indexed page and no archived one.

Run from the repo root (Python 3.9+, standard library only):

    python -m unittest discover -s _tests -v
"""

from __future__ import annotations

import datetime
import json
import re
import unittest

from site_build import build, built_site

SITE = built_site()


def render(template: str, **values) -> str:
    return build.render(build.parse(template, "test"), [values], "test")


class TemplateTest(unittest.TestCase):
    def test_values_blocks_and_loops(self) -> None:
        self.assertEqual(render("{{ a }}-{{ t.b }}", a="x", t={"b": "y"}), "x-y")
        self.assertEqual(render("{{# if on }}yes{{ else }}no{{/ if }}", on=False), "no")
        self.assertEqual(render("{{# each items }}[{{ n }}{{ sep }}]{{/ each }}", items=[{"n": 1}, {"n": 2}], sep=";"), "[1;][2;]")

    def test_a_block_tag_alone_on_its_line_takes_the_line(self) -> None:
        self.assertEqual(render("a\n    {{# if on }}\nb\n    {{/ if }}\nc\n", on=True), "a\nb\nc\n")

    def test_mistakes_stop_the_build(self) -> None:
        for template in ("{{ missing }}", "{{# if on }}open", "{{/ if }}", "{{# loop x }}{{/ loop }}"):
            with self.subTest(template=template), self.assertRaises(build.BuildError):
                render(template, on=True)


class ExampleDataTest(unittest.TestCase):
    """demo/examples.json holds search results in the API's response shape (js/example-box.js)."""

    def test_examples_have_the_shape_the_example_box_reads(self) -> None:
        data = json.loads((build.REPO / "demo" / "examples.json").read_text(encoding="utf-8"))
        self.assertIsInstance(data.get("placeholder"), bool)
        self.assertGreaterEqual(len(data["examples"]), 1)
        for example in data["examples"]:
            with self.subTest(example=example.get("slug")):
                self.assertEqual(set(example["input"]), {"product_name", "brand"})
                self.assertEqual(set(example["category"]), {"de", "en"})
                if "typical_listing" in example:  # optional illustration
                    self.assertEqual(set(example["typical_listing"]), {"de", "en"})
                datetime.date.fromisoformat(example["recorded_at"])
                self.assertGreater(example["duration_ms"], 0)
                response = example["response"]
                for spec in response["specs"]:
                    self.assertTrue(spec["value"], f"{spec['name']} is in specs without a value")
                    for value in spec["value"]:
                        self.assertTrue(0 <= value["confidence"] <= 1)
                        self.assertTrue(value["sources"])
                for spec in response["not_found"]:
                    self.assertEqual(spec["value"], [])

    def test_highlighted_json_reads_as_the_json_it_colours(self) -> None:
        text = json.dumps({"name": "a \"true\" <b>", "unit": None, "confidence": 0.8, "ok": True, "n": [-1, 2e3]}, indent=2)
        html = build.highlight_json(text)
        plain = re.sub(r"</?span[^>]*>", "", html).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
        self.assertEqual(plain, text)
        self.assertIn('<span class="text-sky-300">"name"</span>:', html)
        self.assertIn('<span class="text-emerald-300">"a \\"true\\" &lt;b&gt;"</span>', html)
        self.assertIn('<span class="text-violet-300">null</span>', html)
        self.assertIn('<span class="text-anoraOrange">0.8</span>', html)

    def test_listing_values_read_as_in_the_example_box(self) -> None:
        self.assertEqual(build.format_spec_value(2815.0, "mAh", "de"), "2.815 mAh")
        self.assertEqual(build.format_spec_value(2815.0, "mAh", "en"), "2,815 mAh")
        self.assertEqual(build.format_spec_value([7.4, 71.5, 146.7], "mm", "de"), "7,4 × 71,5 × 146,7 mm")
        self.assertEqual(build.format_spec_value([1920, 1080], None, "de", grouped=False), "1920 × 1080")
        self.assertEqual(build.format_spec_value("True", None, "de"), "Ja")
        self.assertEqual(build.format_spec_value("Apple A14 Bionic", None, "en"), "Apple A14 Bionic")


class PagesTest(unittest.TestCase):
    def test_no_template_tag_is_left_in_a_page(self) -> None:
        leftovers = [p.relative_to(SITE).as_posix() for p in SITE.rglob("*.html") if "{{" in p.read_text(encoding="utf-8")]
        self.assertEqual(leftovers, [])

    def test_every_page_is_its_own_canonical_and_pairs_point_at_each_other(self) -> None:
        for pair in build.PAIRS:
            pages = [p for p in (pair.de, pair.en) if p]
            expected_alternates = (
                [("de", build.url_of(pair.de)), ("en", build.url_of(pair.en)), ("x-default", build.url_of(pair.en))]
                if len(pages) == 2 else []
            )
            for page in pages:
                with self.subTest(page=page):
                    html = (SITE / page).read_text(encoding="utf-8")
                    self.assertEqual(re.findall(r'<link rel="canonical" href="([^"]+)">', html), [build.url_of(page)])
                    alternates = re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', html)
                    self.assertEqual(alternates, expected_alternates)
                    self.assertEqual(re.search(r'<html lang="(\w+)"', html).group(1), "en" if page.startswith("en/") else "de")

    def test_every_page_has_a_link_preview_in_its_language(self) -> None:
        for page in SITE.rglob("*.html"):
            relative = page.relative_to(SITE).as_posix()
            with self.subTest(page=relative):
                html = page.read_text(encoding="utf-8")
                lang = "en" if relative.startswith("en/") else "de"
                images = re.findall(r'<meta property="og:image" content="([^"]+)">', html)
                self.assertEqual(images, [f"{build.SITE}/media/social-share-{lang}.png"])
                self.assertTrue((SITE / "media" / f"social-share-{lang}.png").is_file())
                self.assertEqual(re.findall(r'<meta property="og:url" content="([^"]+)">', html), [build.url_of(relative)])

    def test_structured_data_is_valid_json(self) -> None:
        for page in SITE.rglob("*.html"):
            for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', page.read_text(encoding="utf-8"), re.S):
                with self.subTest(page=page.relative_to(SITE).as_posix()):
                    self.assertEqual(json.loads(block)["@context"], "https://schema.org")

    def test_sitemap_lists_indexed_pages_and_no_archived_ones(self) -> None:
        sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
        listed = re.findall(r"<loc>([^<]+)</loc>", sitemap)
        expected = [build.url_of(p) for pair in build.PAIRS if pair.sitemap for p in (pair.de, pair.en) if p]
        self.assertEqual(sorted(listed), sorted(expected))
        for page in SITE.rglob("*.html"):
            if 'name="robots" content="noindex' in page.read_text(encoding="utf-8"):
                self.assertNotIn(build.url_of(page.relative_to(SITE).as_posix()), listed)


if __name__ == "__main__":
    unittest.main()
