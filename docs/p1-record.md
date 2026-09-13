# P1 record: the corpus pinned

Chat IMPL EVAL-RUN-RECORD P1 · 2026-09-13 · model Opus 5 (1M context), effort xhigh

## 0. Freeze point

`corpus/fetch.py` was committed unrun in `9f19411959be925212085593295bbc2a61e09941`, after the
P0 record in `20e55a92b42f035d0fec7fe2f3e6c0e1a57376c1`. Both signatures verified with
`git log -2 --show-signature` (good ED25519). The script's SHA-256 at that commit is
`0f22577f89eb5f1a78b284522c95ff7091d2fc243e36e3b890cfecba8958f954`. Recorded
2026-09-13T21:47:34Z, before the script's first run.

Before the freeze, the script's helper functions were exercised on two inputs, and on nothing
P1 pins: the P0 scratch copy of the zip, and a synthetic two-member `.eval` built in a scratch
directory.

## 1. The run

    python3 corpus/fetch.py --log data/S5QYXSvQBRSbUbXSnAGbMm.eval --downloaded-at 2026-09-13T21:44:15Z

Exit 0. All checks passed, and `corpus/manifest.json` and `corpus/p1-identity.json` were written.
`python3 corpus/fetch.py --verify` then re-hashed both files: `benchmark_data.zip: OK`,
`S5QYXSvQBRSbUbXSnAGbMm.eval: OK`.

## 2. The manifest row for the log

From `corpus/manifest.json` lines 43–101.

| Field | Value | Lines |
|---|---|---|
| `url` | `https://epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval` | 46 |
| `url_retrieved` | `https://logs.epoch.ai/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval` | 47 |
| `transport` | browser, after the host's human-verification step | 48 |
| `retrieved_at` | 2026-09-13T21:44:15Z, stated by the owner | 49–50 |
| HTTP headers | absent: no header dump, no Content-Length | 51–52 |
| Scripted route | HTTP 403, `AccessDenied` (`corpus/probe/p0-probe.json`) | 53–57 |
| Second retrieval | not possible, so no byte comparison | 58 |
| `sha256` | `93a9f3ca91499c42c533a882a04292efedf6218d74749bc0fa28350cfff1270d` | 66 |
| `bytes` | 15,487,293 | 67 |
| `version` | run `S5QYXSvQBRSbUbXSnAGbMm`, started 2025-01-27T00:00:00.000Z (CSV `id`, `Started at`) | 78 |
| `licence` | not stated. The hub states CC BY 4.0 for its data, and that benchmark questions and answers belong to their creators; neither statement names the logs | 79–80 |
| `citation` | Epoch AI, ‘Capabilities & Benchmarking’. Published online at epoch.ai. Retrieved from ‘https://epoch.ai/benchmarks’ [online resource]. | 81 |
| `published_score` | `0.5091540404040404` (`mean_score`), stderr `0.025861992702770648`, from `gpqa_diamond.csv` lines 440–442 in the pinned zip; read 2026-09-13T21:47:46Z | 82–90 |
| `model_identifier` | `hyperbolic/meta-llama/Meta-Llama-3.1-405B-Instruct` (`header.json` `eval.model`), asserted-from-source | 91–95 |
| `model_version` | `Llama-3.1-405B-Instruct` (CSV `Model version`), asserted-from-source | 96–100 |

## 3. The manifest row for the hub's zip

From `corpus/manifest.json` lines 19–42. This row is the pinned source of the published score.

| Field | Value | Lines |
|---|---|---|
| `url`, `url_effective` | `https://epoch.ai/data/benchmark_data.zip` | 22–23 |
| `http_status`, Content-Type | 200, `application/zip` | 24–25 |
| Content-Length, bytes on disk | 2,283,227 and 2,283,227 | 26, 34 |
| ETag | `"8d41e993ba7558cb1efbaf39c26f5578"` (no Last-Modified sent) | 27–28 |
| `retrieved_at`, `retrieval_finished` | 2026-09-13T21:47:46Z, 2026-09-13T21:47:46Z | 31–32 |
| `sha256` | `e5120e5eba7e7761c989557f3ad1e7ec400cbf98deb642704a111fb79facc6fb` | 33 |
| `licence` | CC-BY-4.0, quoted from `README.md` inside the zip | 38–39 |
| Rows in `gpqa_diamond.csv` | 313 | 41 |

The header dump is `data/benchmark_data.zip.headers`. It is git-ignored with the bytes.

The hub regenerates this zip. The P0 scratch copy (15:46:03Z, 2,283,225 B, `3c562e5a…df781`) and
the pinned copy differ in nine members, `gpqa_diamond.csv` among them: its internal timestamp
moved from 15:14:08 to 21:14:28. In both copies, lines 440–442 of `gpqa_diamond.csv` are
identical. `--restore` is therefore expected to report a mismatch once the hub updates the file
again. From then on, the pinned hash is the only reference for this copy.

## 4. The two checks that stand in for the missing headers

### 4.1 Size gate

From `corpus/p1-identity.json` lines 5–10 (also `corpus/manifest.json` lines 68–73). The rule is
bytes ≤ 50,000,000, read from the file system before the file is opened. The file is 15,487,293
bytes, so it **passes**. Hashing then read 15,487,293 bytes, the same count.

### 4.2 Identity: the log's header against the CSV row

The log's `header.json` fields, from `corpus/p1-identity.json` lines 12–27. Only identity fields
were read; no score or metric was read.

| Field | Value | Line |
|---|---|---|
| archive members, of which `samples/` | 3,173, of which 3,168 | 14–15 |
| log format version, status | 2, `success` | 16–17 |
| `eval.run_id` | `S5QYXSvQBRSbUbXSnAGbMm` | 19 |
| `eval.task_id` | `KxNE6xjTESRmkqZcvy9ba7` | 20 |
| `eval.task` | `GPQA Diamond` | 21 |
| `eval.created` | `2025-01-20T17:01:32+00:00` | 22 |
| `eval.model` | `hyperbolic/meta-llama/Meta-Llama-3.1-405B-Instruct` | 23 |
| `eval.dataset.name`, `.samples` | `Idavidrein/gpqa`, 198 | 24–25 |
| `eval.config.epochs` | 16 | 26 |

| Check | Rule, fixed in the frozen script | Compared | Result | Lines |
|---|---|---|---|---|
| Run id | the CSV `id` equals one of `eval.eval_id`, `eval.run_id`, `eval.task_id` | `S5QYXSvQBRSbUbXSnAGbMm` = `eval.run_id` | **pass** | 29–36 |
| Task | `eval.task` contains "gpqa" (case-folded) and `eval.dataset.samples` = 198 | `GPQA Diamond`, 198 | **pass** | 37–43 |
| Model | the CSV `Model version`, normalised, is a substring of `eval.model`, normalised | `Llama-3.1-405B-Instruct` in `hyperbolic/meta-llama/Meta-Llama-3.1-405B-Instruct` | **pass** | 44–49 |

Overall `pass: true` (line 55). The CSV row is at lines 440–442 (lines 51–54).

## 5. Recorded, without effect on the checks

- **Download metadata** (`corpus/manifest.json` lines 59–65). macOS recorded the file's origin
  as `https://logs.epoch.ai/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval`, which equals
  `url_retrieved`. Its quarantine timestamp is 2026-09-13T21:43:30Z, 45 s before the owner's
  stated finish time.
- **Two dates.** The CSV's `Started at` is `2025-01-27T00:00:00.000Z` (manifest line 78). The log's
  `eval.created` is `2025-01-20T17:01:32+00:00` (identity line 22). They are recorded as found; this
  record does not reconcile them.
- **Provider prefix.** `eval.model` carries the prefix `hyperbolic/`. The header names the route
  by which the model was called; which weights answered is not recorded in any file pinned here.
- **Sample count.** 3,168 sample members = 198 samples × 16 epochs (identity lines 15, 25, 26).
- **Benchmark content.** The log holds benchmark questions and answers, which the hub attributes to
  their creators. It stays in `data/`, uncommitted. Later outputs carry no question, choice or
  answer text.
