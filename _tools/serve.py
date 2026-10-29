"""Build the site and serve it locally the way GitHub Pages does, rebuilding on every change.

_build/build.py (see there) builds the site. This server maps clean URLs like /contact to
contact.html as GitHub Pages does, and rebuilds whenever a page, layout, script, stylesheet or
asset changes; reload the browser to see the result.

Each rebuild goes into a new temporary folder, and the server switches to it only once the build
has succeeded. So a reload during a rebuild shows the last good version, a broken edit leaves it
up, and several servers (or a manual build into _site/) never touch each other's files. The
temporary folders are deleted when the server stops.

Run from anywhere (Python 3.9+, standard library only), then open http://localhost:8000:

    python _tools/serve.py          # or: python _tools/serve.py 8080
"""

from __future__ import annotations

import atexit
import importlib
import os
import shutil
import signal
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "_build"))
import build  # noqa: E402

BUILDS = Path(tempfile.mkdtemp(prefix="anora-serve-"))
atexit.register(shutil.rmtree, BUILDS, ignore_errors=True)
SITE: Path | None = None  # the build being served; None until the first build succeeds
PREVIOUS: Path | None = None  # kept until the next switch, so requests still reading it finish
WATCHED = ["*.html", "en/*.html", "_build/**/*", "js/**/*", "assets/**/*", "media/**/*", "downloads/**/*", "demo/**/*", "opensource/*.json"]


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs) -> None:
        # Read SITE per request: a rebuild switches it while the server runs.
        super().__init__(*args, directory=str(SITE), **kwargs)

    def send_head(self):
        if SITE is None:
            self.send_error(503, "The build failed, see the terminal")
            return None
        return super().send_head()

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
    global build, SITE, PREVIOUS
    started = time.monotonic()
    site = Path(tempfile.mkdtemp(dir=BUILDS))
    try:
        # Reload the build code too, so edits to _build/*.py count without a restart.
        importlib.reload(sys.modules["pages"])
        build = importlib.reload(build)
        build.build(site)
    except Exception as error:  # a broken edit must not stop the server
        shutil.rmtree(site, ignore_errors=True)
        print(f"Build failed: {error}")
        return
    if PREVIOUS:
        shutil.rmtree(PREVIOUS, ignore_errors=True)
    PREVIOUS, SITE = SITE, site
    print(f"Built in {time.monotonic() - started:.1f}s")


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
    # Exit cleanly on kill or a closed terminal too, so atexit deletes the build folders.
    for stop in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(stop, lambda *_: sys.exit(0))
    rebuild()
    threading.Thread(target=watch, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", port), CleanUrlHandler)
    print(f"Serving http://localhost:{port}/  (rebuilds on change, Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
