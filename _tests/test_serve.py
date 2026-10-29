"""The preview server (_tools/serve.py) builds into its own folders and only switches to a finished build.

The real build is swapped for a fake one that writes a single page: whether the build works is
checked by the other tests, these only check how the server handles its build folders.

Run from the repo root (Python 3.9+, standard library only):

    python -m unittest discover -s _tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "_tools"))
import serve  # noqa: E402


def fake_build(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text("ok", encoding="utf-8")


def broken_build(out: Path) -> None:
    raise RuntimeError("broken edit")


class RebuildTest(unittest.TestCase):
    def rebuild(self, build=fake_build) -> None:
        # rebuild() reloads the build code; keep the module as it is so the fake stays in place
        with mock.patch.object(serve.importlib, "reload", lambda module: module), \
                mock.patch.object(serve.build, "build", build), mock.patch("builtins.print"):
            serve.rebuild()

    def test_a_rebuild_switches_to_a_new_folder_and_keeps_one_previous(self) -> None:
        self.rebuild()
        first = serve.SITE
        self.assertTrue((first / "index.html").is_file())
        self.assertTrue(first.is_relative_to(serve.BUILDS))
        self.rebuild()
        second = serve.SITE
        self.assertNotEqual(second, first)
        self.assertEqual(serve.PREVIOUS, first)
        self.assertTrue((first / "index.html").is_file(), "the previous build must stay until the next switch")
        self.rebuild()
        self.assertFalse(first.exists())
        self.assertEqual(serve.PREVIOUS, second)

    def test_a_failed_build_keeps_the_last_good_one(self) -> None:
        self.rebuild()
        good = serve.SITE
        before = set(serve.BUILDS.iterdir())
        self.rebuild(broken_build)
        self.assertEqual(serve.SITE, good)
        self.assertTrue((good / "index.html").is_file())
        self.assertEqual(set(serve.BUILDS.iterdir()), before, "the failed build's folder must be deleted")


if __name__ == "__main__":
    unittest.main()
