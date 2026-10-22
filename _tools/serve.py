"""Build the site and serve it locally the way GitHub Pages does, rebuilding on every change.

The site is built into _site/ by _build/build.py (see there). This server serves _site/, maps
clean URLs like /contact to contact.html as GitHub Pages does, and rebuilds whenever a page,
layout, script, stylesheet or asset changes; reload the browser to see the result.

Run from anywhere (Python 3.9+, standard library only), then open http://localhost:8000:

    python _tools/serve.py          # or: python _tools/serve.py 8080

The folder starts with an underscore so it is never published.
"""

from __future__ import annotations

import importlib
import os
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "_build"))
import build  # noqa: E402

SITE = build.DEFAULT_OUT
WATCHED = ["*.html", "en/*.html", "_build/**/*", "js/**/*", "assets/**/*", "media/**/*", "downloads/**/*", "demo/**/*", "opensource/*.json"]


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        local = super().translate_path(path)
        if not os.path.exists(local) and os.path.isfile(local + ".html"):
            return local + ".html"
        return local


def snapshot() -> dict[Path, float]:
    files = {}
    for pattern in WATCHED:
        for path in REPO.glob(pattern):
            # _build/bin holds the Tailwind binary; __pycache__ changes whenever the build is imported
            if path.is_file() and not {"bin", "__pycache__"} & set(path.relative_to(REPO).parts):
                files[path] = path.stat().st_mtime
    return files


def rebuild() -> None:
    global build
    started = time.monotonic()
    try:
        # Reload the build code too, so edits to _build/*.py count without a restart.
        importlib.reload(sys.modules["pages"])
        build = importlib.reload(build)
        build.build()
        print(f"Built in {time.monotonic() - started:.1f}s")
    except Exception as error:  # a broken edit must not stop the server
        print(f"Build failed: {error}")


def watch() -> None:
    seen = snapshot()
    while True:
        time.sleep(1)
        now = snapshot()
        if now != seen:
            seen = now
            rebuild()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    rebuild()
    threading.Thread(target=watch, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(CleanUrlHandler, directory=str(SITE)))
    print(f"Serving {SITE} at http://localhost:{port}/  (rebuilds on change, Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
