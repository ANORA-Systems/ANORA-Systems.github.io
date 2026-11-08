"""Build anora-systems.com into _site/: pages from their layouts, sitemap.xml, compiled Tailwind CSS.

Run from anywhere (Python 3.9+, standard library only):

    python _build/build.py            # builds into _site/
    python _build/build.py some/dir   # builds into another folder

Pages are the *.html files in the repo root and en/. Each starts with a front matter block,
then an optional <head> block, then the body content:

    ---
    title: Impressum | Anora Systems
    description: ...                (optional)
    nav: full                       full | none
    footer: yes                     yes | no
    body_class: ...                 (optional, default below)
    html_class: ...                 (optional)
    ---
    <head>
        page-only head tags: <style>, Open Graph, JSON-LD, robots
    </head>
    <main>...</main>

_build/layouts/page.html wraps every page; the other files in _build/layouts/ are partials.
Layouts and pages may use these tags (no escaping; values are HTML):

    {{ name }}  {{ t.contact }}           a value; an unknown name stops the build
    {{> footer-content }}                 a partial from _build/layouts/
    {{# if name }} ... {{ else }} ... {{/ if }}
    {{# each name }} ... {{/ each }}      inside, the item's fields are values too

Tailwind CSS is compiled by Tailwind's standalone CLI (no Node), downloaded once into
_build/bin/ and checked against its SHA-256. The folders starting with "_" are not published.
"""

from __future__ import annotations

import datetime
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import urllib.request
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pages import NAV, PAIRS, SITE, STATIC, STRINGS  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
BUILD = REPO / "_build"
LAYOUTS = BUILD / "layouts"
DEFAULT_OUT = REPO / "_site"

DEFAULT_BODY_CLASS = "font-sans text-slate-800 bg-gray-50 flex flex-col min-h-screen"

TAILWIND_VERSION = "3.4.17"
# From the release's sha256sums.txt: https://github.com/tailwindlabs/tailwindcss/releases/tag/v3.4.17
TAILWIND_BINARIES = {
    ("Windows", "x64"): ("tailwindcss-windows-x64.exe", "67f1c5e3f5a03406a7bf5badf5ada09b79f3ae78ec43450c15f7e983068da346"),
    ("Windows", "arm64"): ("tailwindcss-windows-arm64.exe", "76f516476784c00f1562160b5758e3d8f0e6c48957efb26b5b50fbdfd76aa382"),
    ("Linux", "x64"): ("tailwindcss-linux-x64", "7d24f7fa191d2193b78cd5f5a42a6093e14409521908529f42d80b11fde1f1d4"),
    ("Linux", "arm64"): ("tailwindcss-linux-arm64", "69b1378b8133192d7d2feb12a116fa12d035594f58db3eff215879e4ad8cf39b"),
    ("Darwin", "x64"): ("tailwindcss-macos-x64", "6cbdad74be776c087ffa5e9a057512c54898f9fe8828d3362212dfe32fc933a3"),
    ("Darwin", "arm64"): ("tailwindcss-macos-arm64", "a1d0c7985759accca0bf12e51ac1dcbf0f6cf2fffb62e6e0f62d091c477a10a3"),
}


class BuildError(Exception):
    pass


# --- templates -------------------------------------------------------------------------------

TAG = re.compile(r"\{\{\s*([#/>]?)\s*([^}]*?)\s*\}\}")
# A block tag alone on its line takes the line with it, so layouts can be indented normally.
STANDALONE = re.compile(r"(?m)^[ \t]*(\{\{\s*(?:[#/]|else\b)[^}]*\}\})[ \t]*\r?\n")


def parse(text: str, source: str) -> list:
    """Turns a template into nodes: str, ("var", name), ("include", name), ("if", ...), ("each", ...)."""
    text = STANDALONE.sub(r"\1", text)
    root: list = []
    stack = [("root", None, root)]  # (kind, node, list being filled)
    pos = 0
    for match in TAG.finditer(text):
        if match.start() > pos:
            stack[-1][2].append(text[pos:match.start()])
        pos = match.end()
        sigil, body = match.groups()
        if sigil == "#":
            kind, _, name = body.partition(" ")
            if kind not in ("if", "each") or not name.strip():
                raise BuildError(f"{source}: unknown block {{{{# {body} }}}}")
            node = [kind, name.strip(), [], []]
            stack[-1][2].append(node)
            stack.append((kind, node, node[2]))
        elif sigil == "/":
            open_kind = "if" if stack[-1][0] == "else" else stack[-1][0]
            if open_kind != body:
                raise BuildError(f"{source}: {{{{/ {body} }}}} closes nothing open")
            stack.pop()
        elif sigil == ">":
            stack[-1][2].append(("include", body))
        elif body == "else":
            if stack[-1][0] != "if":
                raise BuildError(f"{source}: {{{{ else }}}} outside an if")
            kind, node, _ = stack.pop()
            stack.append(("else", node, node[3]))
        else:
            stack[-1][2].append(("var", body))
    if len(stack) > 1:
        raise BuildError(f"{source}: {{{{# {stack[-1][1][0]} {stack[-1][1][1]} }}}} is never closed")
    root.append(text[pos:])
    return root


def lookup(scopes: list[dict], name: str, source: str):
    first, *rest = name.split(".")
    for scope in reversed(scopes):
        if first in scope:
            value = scope[first]
            for part in rest:
                if not isinstance(value, dict) or part not in value:
                    raise BuildError(f"{source}: unknown value {name}")
                value = value[part]
            return value
    raise BuildError(f"{source}: unknown value {name}")


_partials: dict[str, list] = {}


def partial(name: str) -> list:
    if name not in _partials:
        path = LAYOUTS / f"{name}.html"
        if not path.is_file():
            raise BuildError(f"no partial {path.relative_to(REPO).as_posix()}")
        _partials[name] = parse(path.read_text(encoding="utf-8"), path.name)
    return _partials[name]


def render(nodes: list, scopes: list[dict], source: str) -> str:
    out = []
    for node in nodes:
        if isinstance(node, str):
            out.append(node)
        elif node[0] == "var":
            out.append(str(lookup(scopes, node[1], source)))
        elif node[0] == "include":
            out.append(render(partial(node[1]), scopes, f"{node[1]}.html"))
        elif node[0] == "if":
            branch = node[2] if lookup(scopes, node[1], source) else node[3]
            out.append(render(branch, scopes, source))
        elif node[0] == "each":
            for item in lookup(scopes, node[1], source):
                out.append(render(node[2], scopes + [item], source))
    return "".join(out)


# --- icons -----------------------------------------------------------------------------------

LUCIDE = REPO / "assets" / "lucide"
ICON_TAG = re.compile(r'<i data-lucide="([a-z0-9-]+)"(?: class="([^"]*)")?></i>')
SVG_BODY = re.compile(r"<svg[^>]*>(.*)</svg>", re.S)


def inline_icons(html: str, source: str) -> str:
    """Replace <i data-lucide="name" class="..."></i> with the Lucide SVG, sized 1em by default.

    The SVGs come from assets/lucide/ (Lucide, ISC licence). A missing icon stops the build;
    copy it from the same lucide-static release (see assets/lucide/README.md).
    """

    def replace(match: re.Match) -> str:
        name, classes = match.group(1), match.group(2) or ""
        path = LUCIDE / f"{name}.svg"
        if not path.is_file():
            raise BuildError(f"{source}: no icon assets/lucide/{name}.svg")
        body = " ".join(SVG_BODY.search(path.read_text(encoding="utf-8")).group(1).split())
        class_attr = f"lucide lucide-{name} {classes}".strip()
        return (
            f'<svg class="{class_attr}" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" '
            'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>'
        )

    return ICON_TAG.sub(replace, html)


# --- code highlighting -----------------------------------------------------------------------

# <code class="... language-json"> blocks are coloured at build time: each token gets a tok-* class,
# coloured in _build/site.css (darker shades by default, lighter ones inside .code-dark).
CODE_TAG = re.compile(r'(<code class="[^"]*\blanguage-([a-z]+)\b[^"]*">)(.*?)(</code>)', re.S)
STRING = r'"(?:\\.|[^"\\\n])*"'
TOKENS = {
    # a string followed by a colon is a key; // comments annotate the examples in the docs
    "json": [("com", r"//[^\n]*"), ("key", STRING + r"(?=\s*:)"), ("str", STRING),
             ("num", r"-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b"), ("lit", r"\b(?:true|false|null)\b")],
    "bash": [("com", r"(?<!\S)#[^\n]*"), ("str", STRING + r"|'[^']*'"), ("lit", r"(?<![\w-])--?[a-zA-Z][\w-]*|^curl\b"),
             ("key", r"\$\w+")],
    "python": [("com", r"#[^\n]*"), ("key", STRING + r"(?=\s*:)"), ("str", STRING + r"|'[^'\n]*'"),
               ("num", r"\b\d+(?:\.\d+)?\b"),
               ("lit", r"\b(?:import|from|for|in|if|else|return|def|True|False|None)\b")],
}
TOKEN_PATTERNS = {
    lang: re.compile("|".join(f"(?P<{kind}{i}>{pattern})" for i, (kind, pattern) in enumerate(rules)), re.M)
    for lang, rules in TOKENS.items()
}
HTTP_HEAD = re.compile(r"^([A-Z]+)( [^\n]*)$|^([\w-]+)(:[^\n]*)$", re.M)


def highlight(text: str, lang: str) -> str:
    """HTML for plain-text code, with tokens wrapped in <span class="tok-...">."""
    if lang == "http":
        # request line and headers, then a blank line and a JSON body
        head, sep, body = text.partition("\n\n")

        def head_line(match: re.Match) -> str:
            word, rest = (match.group(1), match.group(2)) if match.group(1) else (match.group(3), match.group(4))
            kind = "lit" if match.group(1) else "key"
            return f'<span class="tok-{kind}">{word}</span>{rest}'

        return HTTP_HEAD.sub(head_line, html_escape(head)) + sep + highlight(body, "json")
    out, end = [], 0
    for match in TOKEN_PATTERNS[lang].finditer(text):
        kind = match.lastgroup.rstrip("0123456789")
        out.append(html_escape(text[end:match.start()]))
        out.append(f'<span class="tok-{kind}">{html_escape(match.group(0))}</span>')
        end = match.end()
    out.append(html_escape(text[end:]))
    return "".join(out)


def highlight_code(html: str, source: str) -> str:
    def replace(match: re.Match) -> str:
        open_tag, lang, body, close_tag = match.groups()
        if lang not in TOKENS and lang != "http":
            raise BuildError(f"{source}: no highlighting for language-{lang}")
        if "<" in body:
            raise BuildError(f"{source}: a language-{lang} block contains markup; write it as plain escaped text")
        return open_tag + highlight(unescape(body), lang) + close_tag

    return CODE_TAG.sub(replace, html)


# --- pages -----------------------------------------------------------------------------------

FRONT_MATTER = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n", re.S)
PAGE_HEAD = re.compile(r"\A\s*<head>\r?\n?(.*?)\s*</head>\r?\n?", re.S)


def url_of(page: str) -> str:
    """Clean URL: en/index.html -> https://anora-systems.com/en/, impressum.html -> .../impressum."""
    path = page[: -len(".html")]
    if path == "index" or path.endswith("/index"):
        path = path[: -len("index")]
    return f"{SITE}/{path}"


def relative_href(source: str, target: str) -> str:
    """Clean relative link from one page file to another (both relative to the repo root)."""
    href = os.path.relpath(target, os.path.dirname(source) or ".").replace(os.sep, "/")
    href = href[: -len(".html")]
    if href == "index":
        return "./"
    if href.endswith("/index"):
        return href[: -len("index")]
    return href


def source_pages() -> list[str]:
    return sorted(p.relative_to(REPO).as_posix() for p in [*REPO.glob("*.html"), *(REPO / "en").glob("*.html")])


def pair_index() -> dict[str, object]:
    index = {}
    for pair in PAIRS:
        for page in (pair.de, pair.en):
            if page:
                if page in index:
                    raise BuildError(f"_build/pages.py lists {page} twice")
                index[page] = pair
    return index


def read_page(page: str) -> tuple[dict[str, str], str, str]:
    text = (REPO / page).read_text(encoding="utf-8")
    match = FRONT_MATTER.match(text)
    if not match:
        raise BuildError(f"{page}: no front matter (--- ... ---) at the top")
    meta = {}
    for line in match.group(1).splitlines():
        if line.strip():
            key, sep, value = line.partition(":")
            if not sep:
                raise BuildError(f"{page}: front matter line without a colon: {line!r}")
            meta[key.strip()] = value.strip()
    body = text[match.end():]
    head = ""
    head_match = PAGE_HEAD.match(body)
    if head_match:
        head = head_match.group(1)
        body = body[head_match.end():]
    for key in ("title", "nav", "footer"):
        if key not in meta:
            raise BuildError(f"{page}: front matter has no {key}")
    if meta["nav"] not in ("full", "none") or meta["footer"] not in ("yes", "no"):
        raise BuildError(f"{page}: nav must be full or none and footer yes or no")
    return meta, head, body


def page_context(page: str, pair, meta: dict[str, str], head: str) -> dict:
    lang = "en" if page.startswith("en/") else "de"
    is_home = page.endswith("index.html")
    alternates = []
    if pair.de and pair.en:
        alternates = [
            {"hreflang": "de", "href": url_of(pair.de)},
            {"hreflang": "en", "href": url_of(pair.en)},
            {"hreflang": "x-default", "href": url_of(pair.en)},
        ]
    langs = []
    for code in ("de", "en"):
        target = getattr(pair, code)
        langs.append({
            "code": code.upper(),
            "hreflang": code,
            "active": code == lang,
            "href": relative_href(page, target) if target else "",
        })
    nav = [
        {"href": nav_href(key, lang, is_home), "label": STRINGS[lang].get(f"{key}_nav", STRINGS[lang][key]), "current": page.endswith(f"{nav_page(key, lang)}.html")}
        for key in NAV
    ]
    return {
        "lang": lang,
        "root": "../" if lang == "en" else "",
        "title": meta["title"],
        "description": meta.get("description", ""),
        "html_class": meta.get("html_class", ""),
        "body_class": meta.get("body_class", DEFAULT_BODY_CLASS),
        "nav_full": meta["nav"] == "full",
        "footer": meta["footer"] == "yes",
        "canonical": url_of(page),
        "alternates": alternates,
        # link previews; the images come from _tools/make_share_images.py
        "og_locale": "de_DE" if lang == "de" else "en_GB",
        "og_image": f"{SITE}/media/social-share-{lang}.png",
        "langs": langs,
        "nav": nav,
        "logo_href": "#" if is_home else "./",
        # the footer script replaces it with the visitor's current year
        "year": str(datetime.date.today().year),
        "t": STRINGS[lang],
        "demo": demo_context(lang),
        "listing": listing_context(lang),
        "results": results_context(lang),
        "head": head,
    }


def nav_page(key: str, lang: str) -> str:
    """The page file name (without .html) a menu entry stands for, if it is a page of this site."""
    if key == "product":
        return "\0"
    return STRINGS[lang].get(f"{key}_href", key)


def nav_href(key: str, lang: str, is_home: bool) -> str:
    # "Product" leads to the top of the homepage
    if key == "product":
        return "#" if is_home else "./"
    return STRINGS[lang].get(f"{key}_href", key)


# --- example data ----------------------------------------------------------------------------

DEMO_FILE = REPO / "demo" / "examples.json"


_demo_data: dict | None = None


def demo_data() -> dict:
    global _demo_data
    if _demo_data is None:
        _demo_data = json.loads(DEMO_FILE.read_text(encoding="utf-8"))
    return _demo_data


def demo_context(lang: str) -> dict:
    """The first example of demo/examples.json, as an excerpt for the homepage."""
    example = demo_data()["examples"][0]
    response = example["response"]
    # sub_values only tells the example box how to join multi-part values; the API has no such field.
    # The records store a missing spec unit as "", the API returns null.
    strip = lambda specs: [  # noqa: E731
        {key: (value or None) if key == "unit" else value for key, value in spec.items() if key != "sub_values"} for spec in specs
    ]
    excerpt = {
        "specs": strip(response["specs"][:2]),
        "not_found": strip(response["not_found"][:1]),
        "status": response["status"],
        "errors": response["errors"],
    }
    # category takes the ID of a saved category, not its name; the ID is an example (the docs' sample UUID)
    request = (
        f"GET /api/v1/search?product_name={example['input']['product_name'].replace(' ', '+')}"
        f"&brand={example['input']['brand']}&category={EXAMPLE_CATEGORY_ID}"
    )
    return {
        "placeholder": bool(demo_data().get("placeholder")),
        "request": html_escape(request),
        "response_json": html_escape(json.dumps(excerpt, indent=2, ensure_ascii=False)),
    }


EXAMPLE_CATEGORY_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6"


# The Re-commerce page compares a typical marketplace listing with the same listing completed
# by SpecScout. The added rows come from this recorded search, values unchanged: (spec name in
# the search, the shop's attribute label in German, in English). Its note says where it comes from.
LISTING_FILE = REPO / "_build" / "listing-example.json"
LISTING_SPECS = [
    ("Display size", "Bildschirmgröße", "Screen size"),
    ("Display resolution", "Auflösung", "Resolution"),
    ("Panel type", "Paneltyp", "Panel type"),
    ("Ports", "Anschlüsse", "Ports"),
    ("Wi-Fi standard", "WLAN", "Wi-Fi"),
    ("CPU cores", "Prozessorkerne", "CPU cores"),
    ("Weight", "Gewicht", "Weight"),
    ("Dimensions", "Abmessungen", "Dimensions"),
]
# The yes/no port specs share one "Ports" row, which names the ports found present.
LISTING_PORTS = [("Thunderbolt or USB4", "Thunderbolt / USB4"), ("HDMI port", "HDMI")]
# Pixel counts read better without thousands separators (1920 × 1080, not 1.920 × 1.080).
LISTING_UNGROUPED = {"Display resolution"}
LISTING_TEXT = {
    "de": {"yes": "Ja", "no": "Nein",
           "recorded": "Aufgezeichnetes Ergebnis vom {date} · Dauer {seconds} s",
           "months": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]},
    "en": {"yes": "Yes", "no": "No",
           "recorded": "Recorded result from {date} · took {seconds} s",
           "months": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]},
}


def format_number(number: float, lang: str, grouped: bool = True) -> str:
    """Up to two decimals, thousands grouped, as Intl.NumberFormat does in js/example-box.js."""
    text = f"{number:{',' if grouped else ''}.2f}".rstrip("0").rstrip(".")
    return text.translate(str.maketrans(",.", ".,")) if lang == "de" else text


def format_spec_value(value, unit: str | None, lang: str, grouped: bool = True) -> str:
    """A value as js/example-box.js shows it: yes/no for true/false, parts joined with ×."""
    text_of = LISTING_TEXT[lang]
    if isinstance(value, bool):
        text = text_of["yes"] if value else text_of["no"]
    elif isinstance(value, str) and value.lower() in ("true", "yes", "false", "no"):
        text = text_of["yes"] if value.lower() in ("true", "yes") else text_of["no"]
    elif isinstance(value, (int, float)):
        text = format_number(value, lang, grouped)
    elif isinstance(value, list):
        text = " × ".join(format_number(part, lang, grouped) if isinstance(part, (int, float)) else str(part) for part in value)
    else:
        text = str(value)
    return f"{text} {unit}" if unit else text


def listing_context(lang: str) -> dict:
    """The rows SpecScout adds to the listing on the Re-commerce page."""
    example = json.loads(LISTING_FILE.read_text(encoding="utf-8"))
    specs = {spec["name"]: spec for spec in example["specs"]}
    text_of = LISTING_TEXT[lang]

    def spec(name: str) -> dict:
        if name not in specs:
            raise BuildError(f"{LISTING_FILE.name} has no value for {name} (LISTING_SPECS in build.py)")
        return specs[name]

    rows = []
    for name, label_de, label_en in LISTING_SPECS:
        if name == "Ports":
            value = ", ".join(port for spec_name, port in LISTING_PORTS if spec(spec_name)["value"] is True)
        else:
            found = spec(name)
            value = format_spec_value(found["value"], found["unit"], lang, name not in LISTING_UNGROUPED)
        rows.append({
            "label": label_de if lang == "de" else label_en,
            "value": html_escape(value),
        })
    date = datetime.date.fromisoformat(example["recorded_at"])
    date_text = f"{date.day}. {text_of['months'][date.month - 1]} {date.year}" if lang == "de" else f"{date.day} {text_of['months'][date.month - 1]} {date.year}"
    return {
        "rows": rows,
        "recorded": text_of["recorded"].format(date=date_text, seconds=round(example["duration_ms"] / 1000)),
    }


# --- benchmark results -----------------------------------------------------------------------

# The Results page, the homepage's proof bar and FAQ and the Re-commerce page show the benchmark
# numbers. The counts come from _tools/make_results.py; the percentages are computed here, so a
# new run only means a new results.json. The names are the public ones, not the grader's.
RESULTS_FILE = REPO / "_build" / "results.json"
RESULTS_CATEGORIES = {
    "Action Camera": ("Actioncam", "Action camera"),
    "Backpack": ("Rucksack", "Backpack"),
    "Bicycle": ("Fahrrad", "Bicycle"),
    "Bluetooth Speaker": ("Bluetooth-Lautsprecher", "Bluetooth speaker"),
    "Car": ("Auto", "Car"),
    "Cordless Drill": ("Akkuschrauber", "Cordless drill"),
    "Desktop": ("Desktop-PC", "Desktop PC"),
    "Espresso Machine": ("Kaffeevollautomat", "Espresso machine"),
    "Refrigerator": ("Kühlschrank", "Refrigerator"),
    "Robot Vacuum": ("Saugroboter", "Robot vacuum"),
    "Robotic Lawnmower": ("Mähroboter", "Robotic lawnmower"),
    "Sleeping Bag": ("Schlafsack", "Sleeping bag"),
    "Smartphone": ("Smartphone", "Smartphone"),
}
RESULTS_TEXT = {
    "de": {
        "exact": "Genau richtig", "included": "Richtiger Wert dabei, Liste weicht ab",
        "none": "Kein richtiger Wert", "missed": "Nicht gefunden",
        "empty_ok": "Richtig leer gelassen", "fabricated": "Trotzdem ein Wert",
        "extra_values": "Alle richtigen Werte, dazu ein weiterer",
        "missing_values": "Nur richtige Werte, aber nicht alle",
        "partial_overlap": "Teils richtig, teils abweichend",
        "no_overlap": "Kein richtiger Wert",
        "high": "Confidence-Wert ab 90 %", "medium": "70 bis 89 %", "low": "unter 70 %",
        "easy": "Klare Datentabelle beim Hersteller",
        "ordinary": "Einige Angaben nur bei Händlern",
        "hard": "Angaben vor allem in PDF-Datenblättern, Werbetexten oder bei Händlern",
        "products": "{n} Produkte",
        "months": LISTING_TEXT["de"]["months"],
    },
    "en": {
        "exact": "Exact match", "included": "Right value included, list differs",
        "none": "No correct value", "missed": "Not found",
        "empty_ok": "Correctly left empty", "fabricated": "A value anyway",
        "extra_values": "All correct values, plus one more",
        "missing_values": "Only correct values, but not all of them",
        "partial_overlap": "Partly correct, partly different",
        "no_overlap": "No correct value",
        "high": "Confidence 90% or more", "medium": "70 to 89%", "low": "below 70%",
        "easy": "Clear spec table from the manufacturer",
        "ordinary": "Some specs only at retailers",
        "hard": "Specs mainly in PDF datasheets, marketing copy or at retailers",
        "products": "{n} products",
        "months": LISTING_TEXT["en"]["months"],
    },
}


def percent(part: int, whole: int, lang: str, digits: int = 0) -> str:
    """89.7% / 89,7 %; digits=0 rounds to whole percent."""
    text = f"{100 * part / whole:.{digits}f}"
    return f"{text.replace('.', ',')}&nbsp;%" if lang == "de" else f"{text}%"


def width(part: int, whole: int) -> str:
    """A bar's CSS width."""
    return f"{100 * part / whole:.2f}%"


def date_text(iso: str, lang: str) -> str:
    date = datetime.date.fromisoformat(iso)
    month = RESULTS_TEXT[lang]["months"][date.month - 1]
    return f"{date.day}. {month} {date.year}" if lang == "de" else f"{date.day} {month} {date.year}"


def results_context(lang: str) -> dict:
    data = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
    text_of = RESULTS_TEXT[lang]
    pct = lambda part, whole, digits=0: percent(part, whole, lang, digits)  # noqa: E731

    # The headline metric: of the answers to specs whose value is published, the share that include
    # the right value (an exact match, or a list with the right value and more or fewer others).
    # Values returned where none is published are shown on their own (empty_bar), not in it.
    def shares(c: dict) -> dict:
        answered = c["correct"] + c["wrong"]
        none = c["no_overlap"] + c.get("unclassified", 0)
        documented = answered + c["missed"]
        return {"answered": answered, "documented": documented, "none": none,
                "included_count": answered - none, "included": pct(answered - none, answered),
                "included_width": width(answered - none, answered), "exact": pct(c["correct"], answered),
                "nothing_right": pct(none, answered, 1), "answered_share": pct(answered, documented)}

    total = data["total"]
    main = shares(total)
    empty = total["correct_abstain"] + total["not_applicable"]
    without_value = empty + total["fabricated"]
    near = main["included_count"] - total["correct"]  # right value included, list differs

    documented_bar = [
        {"label": text_of[key], "count": count, "share": pct(count, main["documented"]),
         "width": width(count, main["documented"]), "color": color}
        for key, count, color in (("exact", total["correct"], "bg-anoraTeal"), ("included", near, "bg-teal-300"),
                                  ("none", main["none"], "bg-amber-400"), ("missed", total["missed"], "bg-gray-300"))
    ]
    empty_bar = [
        {"label": text_of["empty_ok"], "count": empty, "share": pct(empty, without_value),
         "width": width(empty, without_value), "color": "bg-anoraTeal"},
        {"label": text_of["fabricated"], "count": total["fabricated"], "share": pct(total["fabricated"], without_value),
         "width": width(total["fabricated"], without_value), "color": "bg-amber-400"},
    ]
    errors = [
        {"label": text_of[key], "count": total[key], "width": width(total[key], total["wrong"]),
         "color": "bg-amber-400" if key == "no_overlap" else "bg-teal-300"}
        for key in ("extra_values", "missing_values", "partial_overlap", "no_overlap")
    ]
    bands = []
    for band in data["confidence"]:
        s = shares(band)
        bands.append({"label": text_of[band["band"]], "included": s["included"], "width": s["included_width"],
                      "share": pct(s["answered"], main["answered"])})
    high = shares(data["confidence"][0])

    runs = [*data["history"], {"version": data["run"]["date"], **total}]
    worst = max(shares(run)["none"] / shares(run)["answered"] for run in runs)
    history = []
    for run in runs:
        s = shares(run)
        history.append({"label": date_text(run["version"], lang), "nothing_right": s["nothing_right"],
                        "width": width(s["none"] / s["answered"], worst), "current": run is runs[-1]})

    categories = []
    for row in sorted(data["by_category"], key=lambda r: (-shares(r)["included_count"] / shares(r)["answered"], -shares(r)["answered"] / shares(r)["documented"])):
        if row["category"] not in RESULTS_CATEGORIES:
            raise BuildError(f"{RESULTS_FILE.name}: no public name for category {row['category']} (RESULTS_CATEGORIES in build.py)")
        name_de, name_en = RESULTS_CATEGORIES[row["category"]]
        categories.append({"name": name_de if lang == "de" else name_en,
                           "products": text_of["products"].format(n=row["products"]), **shares(row)})

    difficulty = [{"label": text_of[key], **shares(data["difficulty"][key])} for key in ("easy", "ordinary", "hard")]

    run = data["run"]
    seconds = lambda s: f"{s:.0f}"  # noqa: E731
    return {
        "preliminary": run["preliminary"],
        "date": date_text(run["date"], lang),
        "products": data["products"], "categories": data["categories"], "slots": data["slots"],
        "products_total": run["products_total"], "categories_total": run["categories_total"],
        **{key: main[key] for key in ("included", "included_count", "answered", "documented", "exact", "nothing_right", "answered_share")},
        "nothing_right_short": pct(main["none"], main["answered"]), "no_correct": main["none"],
        "correct": total["correct"], "wrong": total["wrong"], "near": near,
        "empty": empty, "without_value": without_value, "fabricated": total["fabricated"],
        "empty_share": pct(empty, without_value),
        "high_included": high["included"], "high_share": pct(high["answered"], main["answered"]),
        "hard_included": difficulty[2]["included"],
        "median_s": seconds(run["median_s"]), "p90_s": seconds(run["p90_s"]),
        "documented_bar": documented_bar, "empty_bar": empty_bar, "errors": errors, "bands": bands,
        "history": history, "by_category": categories, "difficulty": difficulty,
        "first_nothing_right": history[0]["nothing_right"], "first_label": history[0]["label"],
    }


def html_escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def build_pages(out: Path) -> None:
    index = pair_index()
    pages = source_pages()
    unknown = [p for p in pages if p not in index]
    missing = [p for p in index if p not in pages]
    if unknown or missing:
        raise BuildError(
            "pages and _build/pages.py disagree: "
            + "; ".join([f"{p} is not in PAIRS" for p in unknown] + [f"{p} is in PAIRS but missing" for p in missing])
        )
    layout = partial("page")
    for page in pages:
        meta, head, body = read_page(page)
        context = page_context(page, index[page], meta, head)
        context["head"] = render(parse(head, page), [context], page)
        context["content"] = render(parse(body, page), [context], page)
        html = highlight_code(inline_icons(render(layout, [context], f"page.html for {page}"), page), page)
        target = out / page
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(html.replace("\r\n", "\n").encode("utf-8"))


# --- sitemap ---------------------------------------------------------------------------------

def last_changed(page: str) -> str:
    """Date of the last commit that changed the page file; today if it has uncommitted changes."""
    today = datetime.date.today().isoformat()
    try:
        dirty = subprocess.run(["git", "status", "--porcelain", "--", page], cwd=REPO,
                               capture_output=True, text=True, check=True).stdout.strip()
        if dirty:
            return today
        date = subprocess.run(["git", "log", "-1", "--format=%cs", "--", page], cwd=REPO,
                              capture_output=True, text=True, check=True).stdout.strip()
        return date or today
    except (OSError, subprocess.CalledProcessError):
        return today


def build_sitemap(out: Path) -> None:
    entries = []
    for pair in PAIRS:
        if not pair.sitemap:
            continue
        links = ""
        if pair.de and pair.en:
            links = "".join(
                f'\n        <xhtml:link rel="alternate" hreflang="{lang}" href="{url_of(page)}"/>'
                for lang, page in (("de", pair.de), ("en", pair.en), ("x-default", pair.en))
            )
        for page in (pair.de, pair.en):
            if page:
                entries.append(
                    f"    <url>\n        <loc>{url_of(page)}</loc>{links}\n"
                    f"        <lastmod>{last_changed(page)}</lastmod>\n"
                    f"        <changefreq>{pair.changefreq}</changefreq>\n"
                    f"        <priority>{pair.priority}</priority>\n    </url>\n"
                )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n\n' + "\n".join(entries) + "\n</urlset>\n"
    )
    (out / "sitemap.xml").write_bytes(xml.encode("utf-8"))


# --- static files and CSS --------------------------------------------------------------------

def copy_static(out: Path) -> None:
    for entry in STATIC:
        source = REPO / entry
        if source.is_file():
            (out / entry).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, out / entry)
            continue
        for path in source.rglob("*"):
            relative = path.relative_to(REPO)
            if path.is_file() and not any(part.startswith((".", "_")) for part in relative.parts):
                (out / relative).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, out / relative)


def tailwind_binary() -> Path:
    machine = platform.machine().lower()
    arch = "arm64" if machine in ("arm64", "aarch64") else "x64"
    key = (platform.system(), arch)
    if key not in TAILWIND_BINARIES:
        raise BuildError(f"no Tailwind binary for {key}")
    name, sha256 = TAILWIND_BINARIES[key]
    binary = BUILD / "bin" / f"{TAILWIND_VERSION}-{name}"
    if binary.is_file() and hashlib.sha256(binary.read_bytes()).hexdigest() == sha256:
        return binary
    url = f"https://github.com/tailwindlabs/tailwindcss/releases/download/v{TAILWIND_VERSION}/{name}"
    print(f"Downloading Tailwind CSS {TAILWIND_VERSION} ({name}) into _build/bin/ ...")
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != sha256:
        raise BuildError(f"{url} does not match its SHA-256; not using it")
    binary.parent.mkdir(exist_ok=True)
    binary.write_bytes(data)
    binary.chmod(binary.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return binary


def build_css(out: Path) -> None:
    target = out / "assets" / "css" / "site.css"
    target.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [str(tailwind_binary()), "--config", "_build/tailwind.config.js", "--input", "_build/site.css",
         "--output", str(target), "--minify"],
        cwd=REPO, capture_output=True, text=True,
    )
    if result.returncode != 0 or not target.is_file():
        raise BuildError(f"Tailwind failed:\n{result.stdout}\n{result.stderr}")


def build(out: Path = DEFAULT_OUT) -> None:
    # The output folder is deleted first: only _site/ or a folder outside the repo will do.
    out = out.resolve()
    if out != DEFAULT_OUT and (out.is_relative_to(REPO) or REPO.is_relative_to(out)):
        raise BuildError(f"refusing to build into {out}: use _site/ or a folder outside the repo")
    global _demo_data
    _partials.clear()
    _demo_data = None
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    copy_static(out)
    build_pages(out)
    build_sitemap(out)
    build_css(out)


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    try:
        build(out)
    except BuildError as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    print(f"Built {len(source_pages())} pages into {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
