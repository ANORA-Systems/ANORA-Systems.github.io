"""Regenerate the link preview images (Open Graph / Twitter cards) with headless Microsoft Edge.

The pages name media/social-share-de.png (German pages) or media/social-share-en.png (English
pages) as og:image and twitter:image. Each image is 1200 x 630 px, the size LinkedIn, Slack and
the other networks crop to, and is drawn from the template below: the homepage hero's headline
and colours, plus four values of a recorded example (demo/examples.json, Galaxy S24 Ultra), shown
the way the example search shows them. Run this after changing the hero headline, the brand
colours or the example. Not published; folders starting with _ never are.

Run from anywhere (Python 3.9+, standard library only; needs Edge, which Windows ships with):

    python _tools/make_share_images.py
"""

from __future__ import annotations

import html
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EDGE_PATHS = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]
WIDTH, HEIGHT = 1200, 630

# The rows of the result card: spec name and value as the example search shows them, the
# confidence in percent and the number of sources, all from the recorded Galaxy S24 Ultra search.
ROWS = {
    "de": [("Display size", "6,8 inch", 89, 4), ("RAM", "12 GB", 89, 4),
           ("Battery capacity", "5.000 mAh", 89, 4), ("CPU", "Qualcomm Snapdragon 8 Gen 3", 75, 3)],
    "en": [("Display size", "6.8 inch", 89, 4), ("RAM", "12 GB", 89, 4),
           ("Battery capacity", "5,000 mAh", 89, 4), ("CPU", "Qualcomm Snapdragon 8 Gen 3", 75, 3)],
}
TEXT = {
    "de": {
        "headline": "Vollständige, filterbare Produktdaten. Ohne manuelle Recherche.",
        "subline": "Jeder Wert mit Quellen und Confidence-Wert. 20 Suchen im Monat kostenlos.",
        "card": "SpecScout · Beispielsuche",
        "product": "Galaxy S24 Ultra · Samsung · Smartphone",
        "sources": "Quellen",
    },
    "en": {
        "headline": "Complete, filterable product data. Without manual research.",
        "subline": "Every value with sources and a confidence score. 20 searches a month for free.",
        "card": "SpecScout · Example search",
        "product": "Galaxy S24 Ultra · Samsung · Smartphone",
        "sources": "sources",
    },
}

TEMPLATE = """<!DOCTYPE html>
<html lang="{lang}"><head><meta charset="utf-8">
<link rel="stylesheet" href="{fonts}">
<style>
  * {{ box-sizing: border-box; margin: 0; }}
  html, body {{ width: {width}px; height: {height}px; overflow: hidden; }}
  body {{ background: #0B1E3D; color: #fff; font-family: Inter, sans-serif; display: grid;
          grid-template-columns: 540px 1fr; gap: 48px; align-items: center; padding: 0 64px; }}
  .brand {{ margin-bottom: 32px; font-family: Outfit, sans-serif; font-weight: 400; font-size: 34px; letter-spacing: -.01em; }}
  .brand i {{ font-style: normal; color: #00A99D; }}
  h1 {{ font-size: 50px; line-height: 1.12; font-weight: 700; letter-spacing: -.015em; }}
  p.sub {{ margin-top: 24px; font-size: 22px; line-height: 1.45; color: #C4D3E8; }}
  .url {{ margin-top: 36px; font-size: 18px; font-weight: 600; color: #00A99D; }}
  .card {{ background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.2); border-radius: 16px;
           padding: 26px 28px 14px; box-shadow: 0 25px 50px -12px rgba(0,0,0,.5); }}
  .top {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }}
  .dots {{ display: flex; gap: 8px; }}
  .dots i {{ width: 12px; height: 12px; border-radius: 50%; }}
  .top small {{ font-size: 14px; color: #9EB0C9; }}
  .product {{ font-size: 17px; font-weight: 600; padding-bottom: 12px; }}
  .row {{ display: grid; grid-template-columns: 136px 1fr; gap: 12px; padding: 13px 0;
          border-top: 1px solid rgba(255,255,255,.1); align-items: baseline; }}
  .name {{ font-size: 15px; color: #9EB0C9; }}
  .value {{ font-size: 18px; font-weight: 600; }}
  .meta {{ display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 13px; color: #00A99D; }}
  .badge {{ border-radius: 999px; padding: 2px 9px; font-weight: 600; font-size: 13px; border: 1px solid; }}
  .high {{ background: rgba(0,169,157,.2); color: #99f6e4; border-color: rgba(0,169,157,.4); }}
  .mid {{ background: rgba(251,191,36,.15); color: #fde68a; border-color: rgba(252,211,77,.3); }}
</style></head>
<body>
  <div>
    <div class="brand">Spec<i>Scout</i></div>
    <h1>{headline}</h1>
    <p class="sub">{subline}</p>
    <p class="url">anora-systems.com</p>
  </div>
  <div class="card">
    <div class="top"><div class="dots"><i style="background:#ef4444"></i><i style="background:#eab308"></i><i style="background:#22c55e"></i></div><small>{card}</small></div>
    <div class="product">{product}</div>
    {rows}
  </div>
</body></html>
"""


def page(lang: str) -> str:
    # "20 Suchen" must not break after the number
    text = {key: html.escape(value).replace("20 ", "20&nbsp;") for key, value in TEXT[lang].items()}
    rows = "\n    ".join(
        f'<div class="row"><div class="name">{html.escape(name)}</div><div>'
        f'<div class="value">{html.escape(value)}</div>'
        f'<div class="meta"><span class="badge {"high" if percent >= 85 else "mid"}">{percent} %</span>'
        f'{count} {text["sources"]}</div></div></div>'
        for name, value, percent, count in ROWS[lang]
    )
    return TEMPLATE.format(lang=lang, width=WIDTH, height=HEIGHT, rows=rows,
                           fonts=(REPO / "assets/fonts/fonts.css").as_uri(), **text)


def wait_for_new_file(path: Path, before: float | None, timeout: float = 60.0) -> bool:
    """Wait until Edge has written the screenshot (newer Edge versions return before they finish)."""
    deadline = time.monotonic() + timeout
    last_size = -1
    while time.monotonic() < deadline:
        if path.exists() and path.stat().st_mtime != before:
            size = path.stat().st_size
            if size > 0 and size == last_size:
                return True
            last_size = size
        time.sleep(1)
    return False


def main() -> int:
    edge = next((path for path in EDGE_PATHS if path.is_file()), None)
    if edge is None:
        print("Microsoft Edge not found in", ", ".join(map(str, EDGE_PATHS)))
        return 1
    failed = []
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as temp:
        for lang in TEXT:
            source = Path(temp) / f"share-{lang}.html"
            source.write_text(page(lang), encoding="utf-8")
            target = REPO / "media" / f"social-share-{lang}.png"
            before = target.stat().st_mtime if target.exists() else None
            # One profile per image: a launch on a profile whose Edge still runs is handed over.
            subprocess.run(
                [str(edge), "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
                 f"--user-data-dir={Path(temp) / ('profile-' + lang)}", f"--window-size={WIDTH},{HEIGHT}",
                 "--virtual-time-budget=5000", f"--screenshot={target}", source.as_uri()],
                capture_output=True,
            )
            if wait_for_new_file(target, before):
                print(f"{lang} -> media/{target.name}")
            else:
                failed.append(lang)
    if failed:
        print("Failed:", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
