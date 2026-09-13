# P0 record: scaffold, and the probe of one run's log

Chat IMPL EVAL-RUN-RECORD P0 · 2026-09-13 · model Opus 5 (1M context), effort xhigh

## 0. Freeze point

`corpus/probe.py` was committed unrun in `d5fc615ef44f1bd708f0326c926227205f8470b4` (signature
verified with `git log -1 --show-signature`: good ED25519 signature). The script's SHA-256 at
that commit is `d39cb96a7bb4989a3a06402825f580c76bac428b4d5eb180f30a75d9f76c2db0`. Recorded
2026-09-13T16:31:28Z, before the script's first run.

## 1. Scaffold

| Item | Value | Source |
|---|---|---|
| Node, npm | v22.23.1 via fnm, 10.9.8 | `node --version`, `npm --version` |
| Python | 3.9.6 (standard library only) | `python3 --version` |
| `@typedstandards/produce-core` | 0.4.0, `sha512-TdJ9Vg/k…FmrOA==` | `package.json` line 15; `package-lock.json` lines 47–49 |
| `@typedstandards/verify-core` | 0.9.0, `sha512-DeW6VgIi…elPcw==` | `package.json` line 16; `package-lock.json` lines 60–62 |
| Transitive dependencies | `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `canonicalize` 3.0.0 | `package-lock.json` lines 20, 35, 74 |

`npm ci` was run twice from the lockfile under Node 22; the lockfile's SHA-256 was
`b5fc0241…87f04` before and after. The local typedstandards checkout carries produce-core 0.3.0,
so every later phase reads the installed 0.4.0 package, not that checkout.

The sandbox network allowlist is in `.claude/settings.json`. The two log hostnames in section 3
were added by the owner's ruling after the proxy refused them. Commits are made and signed by
the owner, because the sandbox blocks the signing agent's socket.

## 2. The run

The hub's download is `https://epoch.ai/data/benchmark_data.zip`, linked from
`https://epoch.ai/benchmarks/use-this-data`. A scratch copy was read to find a run, and it is not
committed: 2,283,225 B, SHA-256 `3c562e5a13cae84133406b80e1ab072ac17ee023aca0cf4c2a5487a1b4bdf781`,
retrieved 2026-09-13T15:46:03Z. P1 pins its own copy.

Its `gpqa_diamond.csv` has 313 runs. 283 of them carry a `Logs` URL: 273 on
`epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com` and 10 on a staging bucket.

**Selection rule.** Three conditions: an open-weights model, so a second party could re-run it;
a setting without extended reasoning, for a smaller log; and a log in the production bucket. The
choice is Llama-3.1-405B-Instruct, run `S5QYXSvQBRSbUbXSnAGbMm`.

The row as published (`gpqa_diamond.csv` lines 440–442; one record, because the `Training
compute notes` field spans lines):

| Column | Value |
|---|---|
| `Model version` | `Llama-3.1-405B-Instruct` |
| `mean_score` | `0.5091540404040404` |
| `Best score (across scorers)` | `0.5091540404040404` |
| `stderr` | `0.025861992702770648` |
| `Organization` | `Meta AI` |
| `Release date` | `2024-07-23` |
| `Started at` | `2025-01-27T00:00:00.000Z` |
| `id` | `S5QYXSvQBRSbUbXSnAGbMm` |
| `Logs` | `https://epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval` |
| `Log viewer` | `https://logs.epoch.ai/inspect-viewer/36231d6d/viewer.html?log_file=https%3A%2F%2Flogs.epoch.ai%2Finspect_ai_logs%2FS5QYXSvQBRSbUbXSnAGbMm.eval` |

Licence as the source states it (`README.md` inside the zip, and the use-this-data page read at
15:45:50Z): Epoch AI's data is under CC BY 4.0, and "Benchmark questions and answers are the
property of their respective creators." Neither says whether the logs are covered.

## 3. The probe

From `corpus/probe/p0-probe.json`, written by `corpus/probe.py`. Header dumps are alongside it.

| Route | Request (UTC) | Status | Content-Type | Answer | JSON lines |
|---|---|---|---|---|---|
| S3 (`Logs`) | HEAD, 16:31:35 | 403 | `application/xml` | no body on HEAD | 6–22 |
| S3 (`Logs`) | GET `Range: bytes=0-0`, 16:31:35 | 403 | `application/xml` | S3 error `AccessDenied` | 29–45 |
| logs.epoch.ai (viewer) | HEAD, 16:31:36 | 405 | `text/html` | `x-amzn-waf-action: captcha` | 52–68 |
| logs.epoch.ai (viewer) | GET `Range: bytes=0-0`, 16:31:36 | 405 | `text/html` | `captcha`, a page titled "Human Verification" | 75–91 |

`any_route_served_bytes_of_the_log: false` (line 98). Neither route returned a Content-Length or
Content-Range for the log, so its byte count and Content-Type are unknown from the probe.

The committed run reproduces the manual probes in `docs/contact-ledger.md` (15:52:20 to
15:52:59Z). Those also found `AccessDenied` on three other runs' logs and on the bucket listing.
Epoch AI's Python client documents no route to the logs: it reads a user's own copy of an Airtable
base with the user's own API key.

**Omitted from the commit:** `corpus/probe/logs-epoch-ai.range.body`, the first 1 KB of the
challenge page, which embeds the challenge's key material. The page title and headers are kept in
the JSON (lines 82–91) and in `corpus/probe/logs-epoch-ai.range.headers`.

## 4. Gate

The gate asks for a single public file with per-sample scores, no login, and no more than about
50 MB. **The first condition fails for scripted retrieval.** The published link answers
`AccessDenied`, and the viewer route asks for human verification. Nothing was downloaded.

**Owner's ruling (option A), 2026-09-13.** The owner downloads the log in a browser from the
viewer route after the verification step and saves it to `data/`. The terms:
- The manifest keeps the CSV's S3 link as `url`. It adds `url_retrieved`, `transport: "browser,
  after the host's human-verification step"`, and the owner's download time. It states that there
  is no header dump and no Content-Length.
- Two checks stand in for the missing headers, both recorded in `docs/p1-record.md`. First, the
  file size against the 50 MB gate, before anything reads the file. Second, the log's own header
  (run id, task, model) against the CSV row above.
- The S3 copy cannot be fetched, so no second retrieval is compared.
- The hub's zip gets its own manifest row as the source of the published score.
