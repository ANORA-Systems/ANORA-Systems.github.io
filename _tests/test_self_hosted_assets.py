"""Every page of anora-systems.com loads its fonts, icons, styles and scripts from this site.

A font, icon or script loaded from a CDN sends every visitor's IP address to that
provider. Google Fonts loaded that way has cost German sites court rulings and warning
letters, and the privacy policy (datenschutz.html, B.2) promises the site loads nothing
from other servers. The site used Google Fonts, the Tailwind CDN and Font Awesome from
cdnjs until October 2026; see "Self-hosted assets only" in README.md.

The checks run on the built site (_tests/site_build.py), which is exactly what gets published.
Run from the repo root (Python 3.9+, standard library only):

    python -m unittest discover -s _tests -v

The folder starts with an underscore so it is never published.
"""

from __future__ import annotations

import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from site_build import built_site

SITE = built_site()
OWN_ORIGIN = "https://anora-systems.com"

# Hosts that serve fonts, icons or front-end libraries. Script code mentioning one is a runtime load.
FONT_AND_ICON_HOSTS = (
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "fonts.bunny.net",
    "use.typekit.net",
    "p.typekit.net",
    "api.fontshare.com",
    "api.iconify.design",
    "api.simplesvg.com",
    "api.unisvg.com",
    "code.iconify.design",
    "kit.fontawesome.com",
    "use.fontawesome.com",
    "ka-f.fontawesome.com",
    "cdnjs.cloudflare.com",
    "cdn.jsdelivr.net",
    "unpkg.com",
    "cdn.tailwindcss.com",
)

# <link rel> values that make the browser fetch the href. canonical/alternate are only metadata.
FETCHING_LINK_RELS = {
    "stylesheet",
    "icon",
    "shortcut",
    "apple-touch-icon",
    "mask-icon",
    "manifest",
    "preload",
    "modulepreload",
    "prefetch",
    "preconnect",
    "dns-prefetch",
}
SRC_TAGS = {"script", "img", "source", "iframe", "embed", "video", "audio", "track", "input"}
CSS_URL = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)")
CSS_REMOTE_IMPORT = re.compile(r"@import\s+(?:url\()?\s*['\"]?(?:https?:)?//", re.IGNORECASE)


def published_files(suffix: str) -> list[Path]:
    """Files of the built site, skipping any whose path has a part starting with '.' or '_'."""
    return sorted(
        path
        for path in SITE.rglob(f"*{suffix}")
        if not any(part.startswith((".", "_")) for part in path.relative_to(SITE).parts)
    )


class ResourceCollector(HTMLParser):
    """Collects the URLs a page makes the browser fetch, plus inline <style> and <script> code."""

    def __init__(self) -> None:
        super().__init__()
        self.urls: list[str] = []
        self.inline_code: list[str] = []
        self._in_code = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {name: value or "" for name, value in attrs}
        if tag == "link":
            rels = set(attributes.get("rel", "").lower().split())
            if rels & FETCHING_LINK_RELS and attributes.get("href"):
                self.urls.append(attributes["href"])
        if tag in SRC_TAGS and attributes.get("src"):
            self.urls.append(attributes["src"])
        if tag == "object" and attributes.get("data"):
            self.urls.append(attributes["data"])
        if attributes.get("srcset"):
            self.urls.extend(entry.split()[0] for entry in attributes["srcset"].split(",") if entry.strip())
        if attributes.get("style"):
            self.urls.extend(CSS_URL.findall(attributes["style"]))
        self._in_code = tag in {"style", "script"} and not attributes.get("src")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"style", "script"}:
            self._in_code = False

    def handle_data(self, data: str) -> None:
        if self._in_code:
            self.inline_code.append(data)


def local_target(url: str, base: Path) -> Path | None:
    """The repo file a URL points at, or None if it points at another server."""
    if url.startswith(OWN_ORIGIN + "/"):
        url = url[len(OWN_ORIGIN):]
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        return None
    path = unquote(parts.path)
    target = SITE / path.lstrip("/") if path.startswith("/") else base / path
    return target / "index.html" if target.is_dir() else target


class SelfHostedAssetsTest(unittest.TestCase):
    def test_pages_load_resources_only_from_this_repo(self) -> None:
        problems = []
        for page in published_files(".html"):
            collector = ResourceCollector()
            collector.feed(page.read_text(encoding="utf-8"))
            for url in collector.urls:
                if url.startswith("data:"):
                    continue
                target = local_target(url, page.parent)
                name = page.relative_to(SITE).as_posix()
                if target is None:
                    problems.append(f"{name} loads {url} from another server")
                elif not target.exists():
                    problems.append(f"{name} loads {url}, which is not in the repo")
        self.assertEqual(problems, [], "Self-host it under assets/ instead.")

    def test_stylesheets_load_fonts_and_images_only_from_this_repo(self) -> None:
        problems = []
        sources = [(css, css.read_text(encoding="utf-8")) for css in published_files(".css")]
        for page in published_files(".html"):
            collector = ResourceCollector()
            collector.feed(page.read_text(encoding="utf-8"))
            sources.append((page, "\n".join(collector.inline_code)))
        for path, css in sources:
            name = path.relative_to(SITE).as_posix()
            if CSS_REMOTE_IMPORT.search(css):
                problems.append(f"{name} @imports a remote stylesheet")
            if path.suffix != ".css":
                continue  # url() in inline scripts is usually not CSS; inline <style> has none today.

            def check(url: str, must_exist: bool) -> None:
                if url.startswith(("data:", "#")):
                    return
                target = local_target(url.split("?")[0].split("#")[0], path.parent)
                if target is None:
                    problems.append(f"{name} loads {url} from another server")
                elif must_exist and not target.exists():
                    problems.append(f"{name} loads {url}, which is not in the repo")

            # In an @font-face src list the browser takes the first format it supports, so the
            # first file must exist; later fallbacks (Font Awesome's .ttf after its .woff2) are
            # never requested by a current browser and need not ship. None may be remote.
            for face in re.findall(r"@font-face\s*{[^}]*}", css):
                for declaration in re.findall(r"\bsrc\s*:([^;}]*)", face):
                    for index, url in enumerate(CSS_URL.findall(declaration)):
                        check(url, must_exist=index == 0)
            for url in CSS_URL.findall(re.sub(r"@font-face\s*{[^}]*}", "", css)):
                check(url, must_exist=True)
        self.assertEqual(problems, [])

    def test_scripts_fetch_no_font_or_icon_cdn(self) -> None:
        # Only a URL is a load, so a host named in a comment or message would pass.
        problems = []
        scripts = [(js, js.read_text(encoding="utf-8")) for js in published_files(".js")]
        for page in published_files(".html"):
            collector = ResourceCollector()
            collector.feed(page.read_text(encoding="utf-8"))
            scripts.append((page, "\n".join(collector.inline_code)))
        for path, code in scripts:
            for host in FONT_AND_ICON_HOSTS:
                if re.search(rf"(?:https?:)?//{re.escape(host)}", code):
                    problems.append(f"{path.relative_to(SITE).as_posix()} loads from {host}")
        self.assertEqual(problems, [])

    def test_every_page_links_the_fonts_and_the_compiled_css(self) -> None:
        # The Tailwind config sets Inter; without fonts.css a page falls back to Arial, and
        # without site.css it has no styles at all.
        missing = [
            f"{page.relative_to(SITE).as_posix()} does not link {stylesheet}"
            for page in published_files(".html")
            for stylesheet in ("assets/fonts/fonts.css", "assets/css/site.css")
            if stylesheet not in page.read_text(encoding="utf-8")
        ]
        self.assertEqual(missing, [])

    def test_no_page_loads_the_tailwind_play_script(self) -> None:
        # The play script compiled CSS in every visitor's browser; the build compiles it once.
        self.assertEqual(
            [p.relative_to(SITE).as_posix() for p in published_files(".html") if "tailwindcss-play" in p.read_text(encoding="utf-8")],
            [],
        )

    def test_font_stylesheet_declares_fonts_that_exist(self) -> None:
        fonts_css = SITE / "assets" / "fonts" / "fonts.css"
        faces = re.findall(r"@font-face\s*{[^}]*}", fonts_css.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(faces), 7, "Inter, Outfit and Fira Code should all be declared")
        for face in faces:
            for url in CSS_URL.findall(face):
                self.assertTrue((fonts_css.parent / url).exists(), f"fonts.css points at missing {url}")


if __name__ == "__main__":
    unittest.main()
