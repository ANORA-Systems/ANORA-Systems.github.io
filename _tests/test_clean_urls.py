"""Links between our pages use clean URLs (contact, en/, ./) and point at pages that exist.

GitHub Pages serves contact.html at /contact as well. The canonical, hreflang and sitemap URLs
name the clean form, so internal links must too: a link to contact.html shows the extension in
the address bar and makes Google list the page as "Alternate page with proper canonical tag".
To click through the site locally, run python _tools/serve.py, which resolves clean URLs the
way GitHub Pages does; file:// cannot. The checks run on the built site (_tests/site_build.py).

Run from the repo root (Python 3.9+, standard library only):

    python -m unittest discover -s _tests -v
"""

from __future__ import annotations

import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from test_self_hosted_assets import OWN_ORIGIN, SITE, published_files


class LinkCollector(HTMLParser):
    """Collects <a href> and the canonical/alternate <link href> of a page."""

    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name: value or "" for name, value in attrs}
        rels = set(attributes.get("rel", "").lower().split())
        if attributes.get("href") and (tag == "a" or (tag == "link" and rels & {"canonical", "alternate"})):
            self.urls.append(attributes["href"])


def link_problem(url: str, base: Path) -> str | None:
    """Why a link to one of our pages is wrong, or None if it is fine or goes elsewhere."""
    if url.startswith(OWN_ORIGIN):
        url = url[len(OWN_ORIGIN):] or "/"
    parts = urlsplit(url)
    if parts.scheme or parts.netloc or not parts.path:
        return None  # another server, mailto:, tel:, or a #fragment on the same page
    path = unquote(parts.path)
    if path.endswith(".html"):
        return "ends in .html"
    target = SITE / path.lstrip("/") if path.startswith("/") else base / path
    if target.is_dir():
        if not path.endswith("/"):
            return "points at a folder without the trailing slash"
        return None if (target / "index.html").exists() else "has no index.html"
    if target.is_file() or target.with_name(target.name + ".html").is_file():
        return None
    return "points at no page in the repo"


class CleanUrlsTest(unittest.TestCase):
    def test_pages_link_our_pages_by_clean_url(self) -> None:
        problems = []
        for page in published_files(".html"):
            collector = LinkCollector()
            collector.feed(page.read_text(encoding="utf-8"))
            for url in collector.urls:
                problem = link_problem(url, page.parent)
                if problem:
                    problems.append(f"{page.relative_to(SITE).as_posix()}: {url} {problem}")
        self.assertEqual(problems, [])

    def test_sitemap_lists_clean_urls_of_existing_pages(self) -> None:
        sitemap = (SITE / "sitemap.xml").read_text(encoding="utf-8")
        urls = re.findall(r"<loc>([^<]+)</loc>", sitemap) + re.findall(r'href="([^"]+)"', sitemap)
        self.assertTrue(urls)
        problems = [f"{url} {link_problem(url, SITE)}" for url in urls if link_problem(url, SITE)]
        self.assertEqual(problems, [])

    def test_scripts_link_pages_by_clean_url(self) -> None:
        # js/call-scheduler.js runs on both contact pages, so its links have no single base folder.
        problems = [
            f"{script.relative_to(SITE).as_posix()}: {url}"
            for script in published_files(".js")
            if not script.is_relative_to(SITE / "assets")
            for url in re.findall(r'href=\\?"([^"\\]+)', script.read_text(encoding="utf-8"))
            if (url.startswith(OWN_ORIGIN) or not urlsplit(url).netloc) and urlsplit(url).path.endswith(".html")
        ]
        self.assertEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
