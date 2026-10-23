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
    Pair("recommerce.html", "en/recommerce.html", "monthly", "0.7"),
    Pair("preise.html", "en/pricing.html", "monthly", "0.7"),
    Pair("sicherheit.html", "en/security.html", "monthly", "0.5"),
    Pair("ueber-uns.html", "en/about.html", "yearly", "0.5"),
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
        "login": "Anmelden",
        "login_url": "https://dashboard.anora-systems.com/de/auth/login",
        "contact": "Kontakt",
        "menu": "Menü",
        "back_home": "Zurück zur Startseite",
        "rights": "Alle Rechte vorbehalten.",
        "product": "Produkt",
        "company": "Unternehmen",
        "legal": "Rechtliches",
        "recommerce": "Re-Commerce",
        "pricing": "Preise",
        "pricing_href": "preise",
        "security": "Sicherheit &amp; Daten",
        "security_href": "sicherheit",
        "about": "Über uns",
        "about_href": "ueber-uns",
        "docs": "API-Dokumentation",
        "docs_href": "en/api-documentation",
        "imprint": "Impressum",
        "imprint_href": "impressum",
        "privacy": "Datenschutz",
        "privacy_href": "datenschutz",
        "terms": "AGB",
        "terms_href": "agb",
        "providers": "Dienstleister",
        "providers_href": "dienstleister",
        "licenses": "Open-Source-Lizenzen",
        "licenses_href": "open-source-lizenzen",
        "linkedin": "Anora Systems auf LinkedIn",
        "github": "Anora Systems auf GitHub",
        "examples_need_js": "Die Beispiele brauchen JavaScript.",
        "placeholder": "Platzhalterdaten",
    },
    "en": {
        "start_free": "Start free",
        "start_free_url": "https://specscout.anora-systems.com/access",
        "login": "Log in",
        "login_url": "https://dashboard.anora-systems.com/auth/login",
        "contact": "Contact",
        "menu": "Menu",
        "back_home": "Back to Home",
        "rights": "All rights reserved.",
        "product": "Product",
        "company": "Company",
        "legal": "Legal",
        "recommerce": "Re-commerce",
        "pricing": "Pricing",
        "pricing_href": "pricing",
        "security": "Security &amp; Data",
        "security_href": "security",
        "about": "About us",
        "about_href": "about",
        "docs": "API documentation",
        "docs_href": "api-documentation",
        "imprint": "Imprint",
        "imprint_href": "legal",
        "privacy": "Privacy Policy",
        "privacy_href": "privacy",
        "terms": "Terms &amp; Conditions",
        "terms_href": "terms",
        "providers": "Service providers",
        "providers_href": "service-providers",
        "licenses": "Open-source licenses",
        "licenses_href": "open-source-licenses",
        "linkedin": "Anora Systems on LinkedIn",
        "github": "Anora Systems on GitHub",
        "examples_need_js": "The examples need JavaScript.",
        "placeholder": "Placeholder data",
    },
}

# The full menu, in order. Each key is also its label's key in STRINGS (and "<key>_href" its
# link where the file name differs by language); nav_href() in _build/build.py turns it into a
# link relative to the page and marks the current page.
NAV = ["product", "recommerce", "pricing", "docs", "contact"]

# Copied into the build unchanged. Inside folders, names starting with "." or "_" are skipped.
STATIC = ["assets", "media", "js", "downloads", "demo", "opensource/specscout-dependencies.json", "CNAME"]
