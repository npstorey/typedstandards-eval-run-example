# Contact ledger

Every external host this project's chats contact, with refused and failed requests. Times are
UTC. The sandbox network allowlist is in `.claude/settings.json`; a request the local proxy
refused never left the machine and is marked so.

## IMPL EVAL-RUN-RECORD P0, 2026-09-13

| Time | Host | Request | Why | Result |
|---|---|---|---|---|
| — | claude.ai | the Round 0 rulings page (private) | the working contract | read |
| — | registry.npmjs.org | `npm view` for produce-core 0.4.0 and verify-core 0.9.0; `npm install --save-exact`; `npm ci` twice | the two pinned packages and their three dependencies | 200; lockfile written |
| 15:45:35 | epoch.ai | GET `/data/ai-benchmarking-dashboard` | find the hub's data and log links | 301 to `/benchmarks`, then 200, 129,270 B |
| 15:45:50 | epoch.ai | GET `/benchmarks/use-this-data` | the download link, licence and citation | 200, 78,551 B |
| 15:45:57 | epoch.ai | HEAD `/data/benchmark_data.zip` | type before download | 200, `application/zip` |
| 15:46:03 | epoch.ai | GET `/data/benchmark_data.zip` | find a GPQA Diamond run, its `Logs` URL and its published score (scratch copy; pinned in P1) | 200, 2,283,225 B |
| 15:46:56 | logs.epoch.ai | HEAD `/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval` | the log viewer's route to the run's log | **refused by the local proxy** (`X-Proxy-Error: blocked-by-allowlist`); host not yet on the allowlist |
| 15:46:56 | epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com | HEAD `/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval` | the CSV's `Logs` URL for the run | **refused by the local proxy** (`blocked-by-allowlist`) |
| 15:52 | — | both exact hostnames added to the allowlist, owner's ruling | | |
| 15:52:20 | epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com | HEAD, same path | same | **403** |
| 15:52:20 | logs.epoch.ai | HEAD, same path | same | **405**, `x-amzn-waf-action: captcha` |
| 15:52:39 | epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com | GET `Range: bytes=0-0`, same path | total size without downloading | **403**, S3 error `AccessDenied` |
| 15:52:39 | logs.epoch.ai | GET `Range: bytes=0-0`, same path | same | **405**, an HTML page titled "Human Verification" |
| 15:52:59 | epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com | GET `Range: bytes=0-0` for runs `SadaSwnSdMpYRstc8zvgjJ`, `fu7pWqbSC4MUBdwv3GFNa5`, `TxXS78Wg2pSCDbpmeJuzQn` | whether the denial is specific to one run | **403** `AccessDenied`, all three |
| 15:52:59 | epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com | GET `/?list-type=2&prefix=inspect_ai_logs/S5QY&max-keys=5` | whether listing is public | **403** `AccessDenied` |
| 15:53:28 | api.github.com | README of `epoch-research/epochai-python`; metadata (description, file names) of the five gists linked from `epoch.ai/benchmarks` | whether the hub documents a scripted route to its logs | 200; the client reads a user's own copy of an Airtable base with the user's API key; the gists are benchmark implementations; no gist file content read |
| 16:31:35 | epoch-benchmarks-production-public.s3.us-east-2.amazonaws.com | `corpus/probe.py` (committed in `d5fc615`): HEAD and GET `Range: bytes=0-0` on the run's log | the committed probe | **403**, then **403** `AccessDenied` (`corpus/probe/p0-probe.json`) |
| 16:31:36 | logs.epoch.ai | `corpus/probe.py`: HEAD and GET `Range: bytes=0-0` on the run's log | the committed probe | **405** `captcha`, then **405** "Human Verification" (`corpus/probe/p0-probe.json`) |

## P1, 2026-09-13

| Time | Host | Request | Why | Result |
|---|---|---|---|---|
| 21:44:15 (finish) | logs.epoch.ai | the owner's browser: `/inspect_ai_logs/S5QYXSvQBRSbUbXSnAGbMm.eval`, after the host's human-verification step | the run's log (owner's ruling A) | downloaded, 15,487,293 B. The finish time is the owner's statement; macOS's quarantine timestamp on the file is 21:43:30 |
| 21:47:46 | epoch.ai | `corpus/fetch.py`: GET `/data/benchmark_data.zip` | pin the source of the published score | 200, 2,283,227 B, Content-Length matches |

## P2, 2026-09-13

| Time | Host | Request | Why | Result |
|---|---|---|---|---|
| 21:50:51 | api.github.com | `UKGovernmentBEIS/inspect_ai`: tag ref `0.3.57`; contents of `src/inspect_ai/scorer/_metric.py`, `_metrics/accuracy.py` and `_choice.py` at that tag | the value mapping the log's scorer and metric use, for the preregistration | 200; tag at commit `e2add88f`; files read |

## P3, 2026-09-13

| Time | Host | Request | Why | Result |
|---|---|---|---|---|
| 22:07:34 | freetsa.org | `package/build.mjs prove`: POST `/tsr` (`application/timestamp-query`), once per envelope hash | RFC 3161 tokens for both nodes | 200 twice; `package/proofs/<node>.tsr` |
| 22:07:35 | rekor.sigstore.dev | `package/build.mjs prove`: POST `/api/v1/log/entries` (`hashedrekord`), once per envelope hash | public log entries for both nodes (ruling D6) | 201 twice; log indexes 2822632280 and 2822632295; `package/proofs/<node>.rekor-response.json` |

## P4, 2026-09-13

`node verify.mjs` makes no network request: it reported `network fetch calls: 0`
(`docs/verify-output.txt` line 32).

## P5, 2026-09-13

| Time | Host | Request | Why | Result |
|---|---|---|---|---|
| — | registry.npmjs.org | `npm ci` in a scratch clone | test the README's reproduction steps | 5 packages installed from the lockfile |
| 22:24:02 | epoch.ai | `corpus/fetch.py --restore` in a scratch clone: GET `/data/benchmark_data.zip` | test the README's reproduction step 2 | 200, 2,283,221 B, ETag `"978ecdf034ef6bdb78b46589dbf63f1a"`; `MISMATCH` against the pinned zip; the run's row (lines 440–442) is identical in both copies |
