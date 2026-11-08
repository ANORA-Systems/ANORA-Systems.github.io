"""Rebuild the benchmark numbers of the Results page from the benchmark's per-value CSV.

The CSV has one row per labelled slot (one product x one requested spec) of one benchmark run,
graded against the hand-checked labels: brand, product, category, difficulty, spec,
specscout_values, specscout_unit, lowest_confidence, sources, label_applies, label_value,
label_unit, label_also_accepted, verdict, wrong_class. It comes from the SpecScout repo's grading
code (the analysis of 28 Oct 2026 was done in a SpecScout session; ask there for a new export).

Run from anywhere (Python 3.9+, standard library only):

    python _tools/make_results.py C:/path/to/website_results_new_chain.csv

It writes _build/results.json (counts only; the build turns them into the percentages on the
Results page, the homepage and the Re-commerce page) and the download
downloads/specscout-benchmark-results.csv (the same rows). What the CSV does not carry, the run
facts and the earlier runs, is in RUN and HISTORY below: update them with a new run.
Not published; folders starting with _ never are.
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_JSON = REPO / "_build" / "results.json"
OUT_CSV = REPO / "downloads" / "specscout-benchmark-results.csv"

# The run the CSV grades, and the dataset it ran on.
RUN = {
    "date": "2026-10-25",
    "preliminary": True,
    "products_total": 86,      # benchmark dataset v4-beta
    "categories_total": 22,
    "median_s": 21.6,          # end to end, one product per request, dev deployment
    "p90_s": 30.1,
}

# Earlier versions of SpecScout graded against the same labels (891 slots), from the same analysis.
# "version" is the date of the code that ran; "unclassified" counts wrong answers in none of the
# four classes (the build counts them as without a correct value).
HISTORY = [
    {"version": "2026-08-06", "correct": 531, "wrong": 162, "fabricated": 12, "missed": 72, "no_overlap": 49, "unclassified": 1},
    {"version": "2026-10-08", "correct": 590, "wrong": 104, "fabricated": 11, "missed": 71, "no_overlap": 25, "unclassified": 0},
]

VERDICTS = ["correct", "wrong", "fabricated", "missed", "correct_abstain", "not_applicable"]
CLASSES = ["extra_values", "missing_values", "partial_overlap", "no_overlap"]
# Confidence bands: a slot's lowest confidence among its returned values.
BANDS = [("high", 0.90), ("medium", 0.70), ("low", 0.0)]


def counts(rows: list[dict]) -> dict:
    verdicts = Counter(row["verdict"] for row in rows)
    unknown = set(verdicts) - set(VERDICTS)
    if unknown:
        sys.exit(f"unknown verdicts in the CSV: {sorted(unknown)}")
    classes = Counter(row["wrong_class"] for row in rows if row["verdict"] == "wrong")
    out = {verdict: verdicts[verdict] for verdict in VERDICTS}
    out.update({name: classes[name] for name in CLASSES})
    out["unclassified"] = sum(classes.values()) - sum(classes[name] for name in CLASSES)
    return out


def band_of(row: dict) -> str:
    confidence = float(row["lowest_confidence"])
    return next(name for name, low in BANDS if confidence >= low)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    source = Path(sys.argv[1])
    with source.open(encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        fields = reader.fieldnames
        rows = list(reader)

    returned = [row for row in rows if row["verdict"] in ("correct", "wrong", "fabricated")]
    by_band = defaultdict(list)
    for row in returned:
        by_band[band_of(row)].append(row)
    by_category = defaultdict(list)
    by_difficulty = defaultdict(list)
    for row in rows:
        by_category[row["category"]].append(row)
        by_difficulty[row["difficulty"]].append(row)

    data = {
        "run": RUN,
        "products": len({(row["brand"], row["product"]) for row in rows}),
        "categories": len(by_category),
        "slots": len(rows),
        "total": counts(rows),
        "confidence": [{"band": name, "min": low, **counts(by_band[name])} for name, low in BANDS],
        "difficulty": {name: counts(group) for name, group in sorted(by_difficulty.items())},
        "by_category": [
            {"category": name, "products": len({(r["brand"], r["product"]) for r in group}), **counts(group)}
            for name, group in sorted(by_category.items())
        ],
        "history": HISTORY,
    }
    OUT_JSON.write_bytes((json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))

    # The download: the same rows, sorted, with a BOM so spreadsheet apps read the umlauts.
    rows.sort(key=lambda row: (row["category"], row["brand"], row["product"], row["spec"]))
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    total = data["total"]
    print(f"{data['slots']} slots, {data['products']} products, {data['categories']} categories")
    print("  " + ", ".join(f"{key} {total[key]}" for key in VERDICTS + CLASSES))
    print(f"wrote {OUT_JSON.relative_to(REPO).as_posix()} and {OUT_CSV.relative_to(REPO).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
