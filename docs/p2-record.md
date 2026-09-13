# P2 record: the recomputation

Chat IMPL EVAL-RUN-RECORD P2 · 2026-09-13 · model Opus 5 (1M context), effort xhigh

## 0. Freeze point

`analysis/recompute.py` and `docs/p2-preregistration.md` were committed together, unrun, in
`959b2bb2621a643df45d5385a8ea6338ea9da9d3`. The P1 record came before, in
`6741404c30bc46aa0f2959f762539cf5ec3f0b51`. Both signatures verified with
`git log -2 --show-signature` (good ED25519). The script's SHA-256 at the freeze commit is
`bcc5ffaec70174aa8beef04c0430ac469570a8fffc33e295322311fd57a4d61c`, as preregistered. Recorded
2026-09-13T21:58:31Z, before the script's first run on the pinned log.

## 1. The run

    python3 analysis/recompute.py

The script ran from 21:58:40Z to 21:58:41Z and exited 0. None of the preregistered stop
conditions occurred. A second run produced a byte-identical `analysis/out/recomputation.json`
(SHA-256 `54ab7c6f1817f395d1685c920336e59927cfc1c5a559fd3f883f62a1a3313126`, checked with `cmp`).

## 2. Result

From `analysis/out/recomputation.json`.

| Quantity | Value | Lines |
|---|---|---|
| Script SHA-256 (self-hashed) | `bcc5ffae…d61c`, as preregistered | 3 |
| Input | `data/S5QYXSvQBRSbUbXSnAGbMm.eval`, `93a9f3ca…270d`, 15,487,293 B | 4–8 |
| Scorer; other scorers present | `choice`; none | 9–10 |
| Samples, epochs, records | 198, 16 (1 to 16), 3,168 | 19–25 |
| Missing or duplicate (sample, epoch) pairs | none, none | 26–27 |
| Value counts | C 1,613; I 1,555; no P or N | 28–31 |
| Recomputed score | 1613 / 3168 = `0.5091540404040404` | 32–34 |
| Mean of per-sample means | `0.5091540404040404` | 35 |
| Published score (`mean_score`, pinned zip lines 440–442) | `0.5091540404040404` | 36–40 |
| Recomputed − published | `0.0` | 41 |
| Log header `accuracy`, `stderr` | `0.5091540404040404`, `0.025861992702770648` | 44–45 |
| Log header `total_samples`, `completed_samples` | 3,168, 3,168 | 46–47 |
| Recomputed − log header accuracy | `0.0` | 49 |

Under the preregistered interpretation, three figures are equal as floats: the mean of the
3,168 per-record `choice` values in these bytes, the hub's published `mean_score`, and the log
header's own `accuracy`.

Not preregistered, so only recorded here: the header's `stderr`, `0.025861992702770648` (line
45), is the same string as the CSV's `stderr` column (`corpus/manifest.json` line 85). The
script does not recompute a standard error.

No claim is made about whether any of these numbers, or any individual grading, is correct.

## 3. Content

The output carries identifiers, counts and scores only. It contains no question, choice, answer,
explanation or message text; the script reads only `id`, `epoch` and `scores` from each sample.
