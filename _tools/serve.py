"""Serve the site locally the way GitHub Pages does, so clean URLs like /contact work.

Our links name pages without .html (contact, en/privacy). GitHub Pages maps /contact to
contact.html; a page opened from disk (file://) or through plain `python -m http.server` cannot,
so clicking from page to page fails there. This server adds that one rule.

Run from anywhere (Python 3, standard library only), then open http://localhost:8000:

    python _tools/serve.py          # or: python _tools/serve.py 8080

The folder starts with an underscore so GitHub Pages does not publish it.
"""

from __future__ import annotations

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        local = super().translate_path(path)
        if not os.path.exists(local) and os.path.isfile(local + ".html"):
            return local + ".html"
        return local


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(CleanUrlHandler, directory=str(REPO)))
    print(f"Serving {REPO} at http://localhost:{port}/  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
