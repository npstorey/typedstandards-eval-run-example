# typedstandards-eval-run-example: repository instructions

One worked example: a public AI benchmark evaluation run turned into a Typed Standards record
package that anyone can verify offline with one command. The working contract is the owner's
IMPL EVAL-RUN-RECORD brief and its Round 0 rulings (D1–D8). It wins over anything here.

## Fixed

- Data: the Epoch AI Benchmarking Hub, one model on GPQA Diamond, the hub's published per-sample
  Inspect `.eval` log, plus the hub's `benchmark_data.zip` as the source of the published score.
- Packages: `@typedstandards/produce-core` 0.4.0 and `@typedstandards/verify-core` 0.9.0, pinned
  exactly. Never modify them. If the example needs a change to either, stop and describe it.
- Nodes: two `content/analysis/v1` nodes (retrieval record, recomputation). Lineage is a
  `prov:wasDerivedFrom` edge. Do not use `content/evidence/v1`.
- Labels: `producerProfile: 'scripted-recomputation/eval-run'`, `captureMethod: 'script-run'`.
- The signing seed lives outside the repository. Only the public key and `trust-registry.json`
  enter it.

## Runtimes

- Python 3 standard library for the fetch, probe and parse (`corpus/`, `analysis/`).
- Node 22 via fnm for build, sign and verify: `eval "$(fnm env --shell zsh)" && fnm use 22`.

## Working rules

- Bytes live in `data/`, which is git-ignored. `corpus/manifest.json` pins every file. Without a
  flag, `corpus/fetch.py` refuses to overwrite a pinned manifest; `--verify` re-hashes.
- Retrieval uses curl with a header dump. Hash the bytes as retrieved, and cross-check the byte
  count against Content-Length.
- A script is committed unrun before it runs. The P2 formula is frozen in a preregistration first.
- Every number in a phase record cites the file and lines it came from.
- Make no claim about whether any published score is correct.
- A failed download or a failed proof submission is reported as what it is, never filled in.
- Every external host contacted goes into `docs/contact-ledger.md`, including refused requests.

## Housekeeping

- Code is MIT (`LICENSE`). Text is CC BY 4.0 (`LICENSE-CC-BY-4.0.txt`). Third-party data keeps the
  licence its source states, or "not stated".
- Neutral phrasing in everything committed. No credentials, emails or keys.
- Commit to `main`. Push only when the owner says push. The global pre-push guard is never
  bypassed.
