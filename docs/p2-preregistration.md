# P2 preregistration: the recomputation, frozen before it runs

Chat IMPL EVAL-RUN-RECORD P2 · written 2026-09-13, before `analysis/recompute.py` has run on the
pinned log · model Opus 5 (1M context), effort xhigh

This file and the script are committed together. The script's first run on the pinned log
comes after that commit.

## Script

`analysis/recompute.py`, SHA-256 `bcc5ffaec70174aa8beef04c0430ac469570a8fffc33e295322311fd57a4d61c`.
Input: `data/S5QYXSvQBRSbUbXSnAGbMm.eval`, SHA-256
`93a9f3ca91499c42c533a882a04292efedf6218d74749bc0fa28350cfff1270d`, 15,487,293 B
(`corpus/manifest.json` lines 66–67). The script re-hashes the log against the manifest before
opening it, and stops on a mismatch.

## Formula

**accuracy = the mean, over every (sample, epoch) record in the log's `samples/*.json`, of the
`choice` score's value, mapped to a number.**

- **Scorer.** The log names one scorer, `choice`. `header.json` `results.scores` has one entry,
  `{name: choice, scorer: choice, params: {}}`, with metrics named `accuracy` and `stderr`.
  Each sample file has a `scores.choice` object with fields `value`, `answer` and `explanation`;
  its `value` is a string.
- **Mapping.** C → 1, I → 0, P → 0.5, N → 0; numbers and booleans are cast to float. This is
  inspect_ai's `value_to_float` at the version the log records (`eval.packages`:
  `inspect_ai 0.3.57`), read at tag `0.3.57` (commit `e2add88f8079a0a7bc50b77c940c2de6756577d2`):
  `src/inspect_ai/scorer/_metric.py` lines 25–34 (the constants) and 162–182 (`to_float`).
- **Partial credit.** The log carries no partial-credit rule of its own. The `choice` scorer at
  that version sets a value only to CORRECT or INCORRECT (`src/inspect_ai/scorer/_choice.py`
  line 80), so P and N are mapped but not expected.
- **Unknown values.** Where inspect_ai would log a warning and return 0 (`_metric.py` lines
  180–182), the script stops and names the value. An unexpected value therefore cannot pass
  silently.
- **Epochs.** `eval.config.epochs` is 16. The primary figure pools all records. The mean of
  per-sample means is reported beside it; the two are equal when every sample has the same
  number of epochs. The script lists missing and duplicate (sample, epoch) pairs.

## Outputs (`analysis/out/recomputation.json`)

`n_samples`, `n_epochs`, `n_records`, missing and duplicate pairs, value counts,
`recomputed_score` (float) with its exact ratio and reduced fraction, `mean_of_sample_means`,
`published_score` (the manifest's verbatim string and its source),
`difference_recomputed_minus_published`, and the log header's own `accuracy` and `stderr` with
`difference_recomputed_minus_log_header_accuracy`.

The script's own SHA-256 and the input's SHA-256 are written into the output. The output
carries no timestamp, so a rerun on the same bytes gives the same file.

The script reads only `id`, `epoch` and `scores` from each sample, and writes no question,
choice, answer, explanation or message text.

## Stop conditions

- The log's bytes do not match the manifest.
- A sample has no `choice` score.
- A value falls outside the mapping.

In each case the script exits non-zero, writes no output, and the stop is reported as the result.

## Interpretation, frozen

- The differences are reported as numbers. Floats are compared exactly, and the exact fraction
  is given beside the float.
- A difference of zero says one thing only: the published figure equals the mean of the
  per-sample values in these bytes, under this mapping.
- A non-zero difference is reported without explanation beyond what the pinned files show.
- **No claim is made about whether either number is correct**: not the published score, not
  the recomputed one, and not any individual answer's grading.

## Read before this freeze

From the log, only these: the `header.json` keys `version`, `status`, `eval` (identity fields,
`config.epochs`, `packages`, `task_file`), `plan` step names and `results.scores` entry names;
the list of archive members; and the key names of one sample file with the type of its
`scores.choice.value`.

Not read: any score value, any metric value, `results.total_samples` or
`results.completed_samples`, `reductions.json`, `summaries.json`, and the journal.

The helper logic was exercised only on a synthetic six-record log in a scratch directory.
