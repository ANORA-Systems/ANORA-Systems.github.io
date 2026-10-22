"""What the build needs to know about the site's pages, apart from the pages themselves.

Every page file (*.html in the repo root and en/) must appear in PAIRS: the build stops on a
page it does not know, so no page can miss its hreflang alternates or its sitemap entry.
A German page and its English counterpart form one pair; canonical, hreflang and sitemap.xml
are generated from it. x-default points at the English page, as before.
"""

from __future__ import annotations

from dataclasses import dataclass

SITE = "https://anora-systems.com"


@dataclass(frozen=True)
class Pair:
    de: str | None  # German page file, relative to the repo root; None if there is none
    en: str | None  # English page file
    changefreq: str = "yearly"
    priority: str = "0.3"
    sitemap: bool = True  # False for archived pages (they carry noindex)


PAIRS = [
    Pair("index.html", "en/index.html", "monthly", "1.0"),
    Pair("contact.html", "en/contact.html", "monthly", "0.6"),
    Pair("impressum.html", "en/legal.html"),
    Pair("datenschutz.html", "en/privacy.html"),
    Pair("dienstleister.html", "en/service-providers.html", "monthly", "0.2"),
    Pair("agb.html", "en/terms.html"),
    Pair("open-source-lizenzen.html", "en/open-source-licenses.html", "yearly", "0.2"),
    Pair(None, "en/api-documentation.html", "monthly", "0.8"),
    Pair("agb-2026-02.html", "en/terms-2026-02.html", sitemap=False),
]

# Text the shared layouts use, per language. Values are HTML (& is &amp;).
# The *_href values are relative: every page of a language sits in the same folder.
STRINGS = {
    "de": {
        "start_free": "Kostenlos starten",
        "start_free_url": "https://specscout.anora-systems.com/de/access",
        "contact": "Kontakt",
        "back_home": "Zurück zur Startseite",
        "rights": "Alle Rechte vorbehalten.",
        "imprint": "Impressum",
        "imprint_href": "impressum",
        "privacy": "Datenschutz",
        "privacy_href": "datenschutz",
        "terms": "AGB",
        "terms_href": "agb",
        "linkedin": "Anora Systems auf LinkedIn",
    },
    "en": {
        "start_free": "Start free",
        "start_free_url": "https://specscout.anora-systems.com/access",
        "contact": "Contact",
        "back_home": "Back to Home",
        "rights": "All rights reserved.",
        "imprint": "Imprint",
        "imprint_href": "legal",
        "privacy": "Privacy Policy",
        "privacy_href": "privacy",
        "terms": "Terms &amp; Conditions",
        "terms_href": "terms",
        "linkedin": "Anora Systems on LinkedIn",
    },
}

# The homepage sections the full menu links to (section id, label), before "Contact".
NAV_SECTIONS = {
    "de": [
        ("problem", "Problem"),
        ("solution", "Lösung"),
        ("whyspecscout", "Vorteile"),
        ("recommerce", "Re-Commerce"),
        ("team", "Über uns"),
        ("faq", "FAQ"),
    ],
    "en": [
        ("problem", "Problem"),
        ("solution", "Solution"),
        ("whyspecscout", "Benefits"),
        ("recommerce", "Re-Commerce"),
        ("team", "About Us"),
        ("faq", "FAQ"),
    ],
}

# Copied into the build unchanged. Inside folders, names starting with "." or "_" are skipped.
STATIC = ["assets", "media", "js", "downloads", "opensource/specscout-dependencies.json", "CNAME"]
