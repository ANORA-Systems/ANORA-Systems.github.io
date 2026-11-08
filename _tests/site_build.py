"""Builds the site once per test run into a temporary folder, so the tests check what gets published.

The pages in the repo are build sources (front matter, no shared nav or head); _build/build.py
turns them into the published site. Every test module calls built_site() and gets the same build.
"""

from __future__ import annotations

import atexit
import shutil
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "_build"))
import build  # noqa: E402


@lru_cache(maxsize=None)
def built_site() -> Path:
    folder = Path(tempfile.mkdtemp(prefix="anora-site-"))
    atexit.register(shutil.rmtree, folder, ignore_errors=True)
    site = folder / "site"
    build.build(site)
    return site
