"""Regenerate the AGB/GTC PDFs in downloads/ from their HTML pages with headless Microsoft Edge.

Each PDF is a print of its page (the pages' @media print styles decide the layout), so run this
after every change to one of the pages below. Not published; GitHub Pages skips _ folders.

Run from anywhere (Python 3, standard library only; needs Edge, which Windows ships with):

    python _tools/make_pdfs.py            # all PDFs
    python _tools/make_pdfs.py agb.html   # only the PDFs of the pages named
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# page -> PDF; the pages' download links point at these files
PDFS = {
    "agb.html": "downloads/agb.pdf",
    "en/terms.html": "downloads/terms.pdf",
    "agb-2026-02.html": "downloads/agb-2026-02.pdf",
    "en/terms-2026-02.html": "downloads/terms-2026-02.pdf",
}

EDGE_PATHS = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def wait_for_new_file(pdf: Path, before: float | None, timeout: float = 60.0) -> bool:
    """Wait until Edge has rewritten the PDF and finished writing it.

    Newer Edge versions return from the launch at once and print in the
    background, so the file appears a few seconds after subprocess.run ends.
    """
    deadline = time.monotonic() + timeout
    last_size = -1
    while time.monotonic() < deadline:
        if pdf.exists() and pdf.stat().st_mtime != before:
            size = pdf.stat().st_size
            if size > 0 and size == last_size:
                return True
            last_size = size
        time.sleep(1)
    return False


def main(pages: list[str]) -> int:
    edge = next((path for path in EDGE_PATHS if path.is_file()), None)
    if edge is None:
        print("Microsoft Edge not found in", ", ".join(map(str, EDGE_PATHS)))
        return 1
    unknown = [page for page in pages if page not in PDFS]
    if unknown:
        print("No PDF for", ", ".join(unknown), "- known pages:", ", ".join(PDFS))
        return 1

    failed = []
    # Edge can still hold its profile's lock file when the loop ends; a leftover
    # temp folder is harmless, a crash after the PDFs are written is not.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as profiles:
        for number, page in enumerate(pages or PDFS):
            pdf = REPO / PDFS[page]
            pdf.parent.mkdir(exist_ok=True)
            before = pdf.stat().st_mtime if pdf.exists() else None
            # One profile per page: a launch on a profile whose Edge is still
            # running is handed to that instance instead of printing.
            profile = Path(profiles) / str(number)
            # The virtual time budget lets the Tailwind play script style the page before printing.
            subprocess.run(
                [str(edge), "--headless=new", "--disable-gpu", "--no-first-run",
                 f"--user-data-dir={profile}", "--no-pdf-header-footer",
                 "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", (REPO / page).as_uri()],
                capture_output=True,
            )
            if wait_for_new_file(pdf, before):
                print(f"{page} -> {PDFS[page]}")
            else:
                failed.append(page)
    if failed:
        print("Failed:", ", ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
