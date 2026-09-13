#!/usr/bin/env python3
"""P2: recompute the run's accuracy from the per-sample scores in the pinned Inspect log.

The formula is frozen in docs/p2-preregistration.md:
    accuracy = mean, over every (sample, epoch) record in samples/*.json, of the `choice`
    score's value mapped C -> 1, I -> 0, P -> 0.5, N -> 0, numbers and booleans cast to float.
Any other value stops the script. The mean of per-sample means is reported beside it.

Reads corpus/manifest.json and data/<log>. Re-hashes the log against the manifest before
opening it. Reads only `id`, `epoch` and `scores` from each sample; no question, choice, answer
or message text is written anywhere. Writes analysis/out/recomputation.json with no timestamps,
so a rerun on the same bytes produces the same file. Standard library only.

    python3 analysis/recompute.py
"""
import collections
import fractions
import hashlib
import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "corpus" / "manifest.json"
OUT = ROOT / "analysis" / "out" / "recomputation.json"
SCORER = "choice"
MAPPING = {"C": fractions.Fraction(1), "I": fractions.Fraction(0), "P": fractions.Fraction(1, 2), "N": fractions.Fraction(0)}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def to_fraction(value):
    if isinstance(value, bool):
        return fractions.Fraction(int(value))
    if isinstance(value, (int, float)):
        return fractions.Fraction(value)
    if isinstance(value, str) and value in MAPPING:
        return MAPPING[value]
    sys.exit(f"score value outside the preregistered mapping: {value!r}; stopped")


def main():
    manifest = json.loads(MANIFEST.read_text())
    entry = next(e for e in manifest["files"] if e["artifact"] == "inspect-eval-log")
    log_path = ROOT / "data" / entry["file"]
    raw = log_path.read_bytes()
    if sha256(raw) != entry["sha256"] or len(raw) != entry["bytes"]:
        sys.exit(f"{entry['file']}: bytes do not match corpus/manifest.json; stopped")

    records, other_scorers = [], collections.Counter()
    with zipfile.ZipFile(log_path) as z:
        header = json.loads(z.read("header.json"))
        for name in sorted(n for n in z.namelist() if n.startswith("samples/")):
            sample = json.loads(z.read(name))
            scores = sample.get("scores") or {}
            other_scorers.update(k for k in scores if k != SCORER)
            if SCORER not in scores:
                sys.exit(f"{name}: no `{SCORER}` score; stopped")
            value = scores[SCORER]["value"]
            records.append((str(sample["id"]), int(sample["epoch"]), value, to_fraction(value)))

    ids = sorted({r[0] for r in records})
    epochs = sorted({r[1] for r in records})
    pairs = collections.Counter((r[0], r[1]) for r in records)
    duplicates = sorted(f"{i} epoch {e}" for (i, e), n in pairs.items() if n > 1)
    missing = sorted(f"{i} epoch {e}" for i in ids for e in epochs if (i, e) not in pairs)

    total = sum(r[3] for r in records)
    pooled = total / len(records)
    per_sample = collections.defaultdict(list)
    for r in records:
        per_sample[r[0]].append(r[3])
    sample_means = sum(sum(v) / len(v) for v in per_sample.values()) / len(per_sample)

    head_score = next((s for s in header.get("results", {}).get("scores", []) if s.get("name") == SCORER), None)
    head_metrics = (head_score or {}).get("metrics", {})
    published = entry["published_score"]
    published_value = float(published["value"])
    recomputed = float(pooled)

    result = {
        "script": "analysis/recompute.py",
        "script_sha256": sha256(pathlib.Path(__file__).read_bytes()),
        "input": {"file": f"data/{entry['file']}", "sha256": entry["sha256"], "bytes": entry["bytes"]},
        "scorer": SCORER,
        "scorers_present_other_than_choice": dict(other_scorers),
        "value_mapping": {"C": 1, "I": 0, "P": 0.5, "N": 0, "numbers and booleans": "cast to float"},
        "formula": "mean over every (sample, epoch) record of the mapped `choice` value",
        "n_samples": len(ids),
        "n_epochs": len(epochs),
        "epochs": [epochs[0], epochs[-1]] if epochs else [],
        "n_records": len(records),
        "missing_sample_epoch_pairs": missing,
        "duplicate_sample_epoch_pairs": duplicates,
        "value_counts": dict(sorted(collections.Counter(str(r[2]) for r in records).items())),
        "recomputed_score_as_ratio": f"{total} / {len(records)}",
        "recomputed_score_fraction": f"{pooled.numerator}/{pooled.denominator}",
        "recomputed_score": recomputed,
        "mean_of_sample_means": float(sample_means),
        "published_score": {"value": published["value"], "source": published["source"], "url": published["url"]},
        "difference_recomputed_minus_published": recomputed - published_value,
        "log_header_metric": {
            "source": "header.json results.scores[name=choice].metrics",
            "accuracy": (head_metrics.get("accuracy") or {}).get("value"),
            "stderr": (head_metrics.get("stderr") or {}).get("value"),
            "results_total_samples": header.get("results", {}).get("total_samples"),
            "results_completed_samples": header.get("results", {}).get("completed_samples"),
        },
        "difference_recomputed_minus_log_header_accuracy": (
            recomputed - head_metrics["accuracy"]["value"] if "accuracy" in head_metrics else None
        ),
        "claim": "none about whether either score is correct",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    for k in ("n_samples", "n_epochs", "n_records", "value_counts", "recomputed_score", "mean_of_sample_means",
              "difference_recomputed_minus_published", "log_header_metric",
              "difference_recomputed_minus_log_header_accuracy"):
        print(f"{k}: {result[k]}")
    print(f"missing pairs {len(missing)}, duplicate pairs {len(duplicates)}")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
