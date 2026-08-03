"""Generate the public dependency data from a full SPDX SBOM export.

Usage: python _generate_compact.py <path-to-sbom-export.json>

The full SBOM export must NOT be committed to this (public) repo — keep it
in Local/Anora_Code/SBOMs/. This script derives the two public files:

  _sbom_compact.js            data rendered by the license pages
  specscout-dependencies.json downloadable dependency list (readable keys)

Keeps only third-party PyPI packages with a concrete version (drops the
root repo package, first-party packages, GitHub Actions entries, and
unresolved-version duplicates). The repo identifier is replaced with a
display name so internal naming stays private.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
DISPLAY_NAME = "SpecScout API"
FIRST_PARTY = {"specscout"}

if len(sys.argv) < 2:
    sys.exit("Usage: python _generate_compact.py <path-to-sbom-export.json>\n"
             "(full SBOM exports live in Local/Anora_Code/SBOMs/, not in this repo)")

doc = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if "sbom" in doc:  # API export wraps the document, UI export does not
    doc = doc["sbom"]


def purl_of(pkg):
    for ref in pkg.get("externalRefs", []):
        if ref.get("referenceType") == "purl":
            return ref.get("referenceLocator", "")
    return ""


pkgs = []
for p in doc["packages"]:
    purl = purl_of(p)
    version = p.get("versionInfo") or ""
    if not purl.startswith("pkg:pypi/"):
        continue
    if not version or "*" in version:
        continue
    if p["name"].lower() in FIRST_PARTY:
        continue
    entry = {"n": p["name"], "v": version}
    lic = p.get("licenseConcluded")
    if lic and lic != "NOASSERTION":
        entry["l"] = lic
    cr = p.get("copyrightText")
    if cr and cr != "NOASSERTION":
        entry["c"] = cr
    entry["u"] = purl
    pkgs.append(entry)

pkgs.sort(key=lambda e: e["n"].lower())

created = doc["creationInfo"]["created"][:10]

compact = {"name": DISPLAY_NAME, "created": created, "pkgs": pkgs}
payload = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
(HERE / "_sbom_compact.js").write_text("var SBOM_DATA=" + payload + ";", encoding="utf-8")

download = {
    "product": DISPLAY_NAME,
    "generated": created,
    "dependencies": [
        {
            "name": e["n"],
            "version": e["v"],
            "license": e.get("l"),
            "copyright": e.get("c"),
            "purl": e["u"],
        }
        for e in pkgs
    ],
}
(HERE / "specscout-dependencies.json").write_text(
    json.dumps(download, ensure_ascii=False, indent=1), encoding="utf-8")

print(f"{len(pkgs)} packages written to _sbom_compact.js and specscout-dependencies.json")
